# FID: Live free-allocation refresh

**Filename:** `FID-2026-1103-150-live-free-allocation-refresh.md`
**ID:** FID-2026-1103-150
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one authenticated read route, one button; no polling, no new data model.

## Summary

The free-allocation panel is rendered once on a dynamic page and offers only
"Open your account" or "Sign in". A customer who has just created a key, changed
plan capacity or waited for a new upstream observation must reload the page
without knowing whether that will change anything. Add a **Check now** action
that asks the server for a fresh allocation snapshot, reports the check time or
the failure honestly, and refreshes the server-rendered panel. The initial
balances stay visible on failure; the action never invents a zero.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x, React 19 / Next 16 App Router
- **Tool Versions:** npm, HeroUI v3
- **Commit/State:** `416ee11` on `main`

## Detailed Description

### Problem

`components/catalog/free-allocation-panel.tsx` is a server component. Its only
actions are links. The existing `/api/account/trial` route returns the daily
summary, but returns `503` with `trial: null` in lifetime mode
(`getDailyTrialSummary` returns `null` when `TRIAL_ENABLED=true`). Reusing it for
a refresh would show a false "unavailable" state in trial mode. There is also no
last-checked timestamp, so a customer cannot tell whether the observation is
current.

### Expected Behavior

A signed-in customer on a free SKU sees **Check now** next to the balance. One
click returns either:

- a fresh snapshot from the same reads the page uses, followed by a
  server-rendered panel refresh and "Checked just now"; or
- an explicit "could not read your allocation; nothing was changed" message,
  with the previously rendered balance still on screen.

Lifetime mode returns the trial balance; daily mode returns the daily summary.
Signed-out requests remain `401`. The response is `no-store`.

### Root Cause

The panel was built as a static server render (FID-147) with no client
interaction or mode-aware read endpoint.

### Evidence

```text
components/catalog/free-allocation-panel.tsx: no "use client", no refresh control
app/api/account/trial/route.ts: getDailyTrialSummary only
lib/storage/store/daily-trial.ts: if (readTrialConfig().enabled) return null
```

## Impact Assessment

### Affected Components

- `app/api/account/allocation/route.ts` (new)
- `components/catalog/free-allocation-check.tsx` (new)
- `components/catalog/free-allocation-panel.tsx`
- `app/models/[...id]/page.tsx` (passes the mode already; no change expected)

### Risk Level

- [x] Medium: a refresh that lies about availability or hides a failure would
  mislead a paying customer.

## Proposed Solution

### Approach

Add one authenticated read route that mirrors the page's two reads, and a small
client control that fetches it, then calls `router.refresh()`. Keep all balance
markup on the server so the refresh cannot drift from the page. Do not poll;
manual refresh is the requested behavior and avoids background load.

### Steps

1. **implemented (design):** `GET /api/account/allocation` requires a customer,
   reads `readTrialConfig()`, returns
   `{ mode: "lifetime" | "daily", lifetime, daily }`, `200` when the selected
   read succeeds and `503` with a sanitized error otherwise. `no-store`.
2. **implemented (design):** `FreeAllocationCheck` is a client control with
   idle/checking/checked/error states. On success it records the local check
   time, announces "Checked just now", and calls `router.refresh()`; on failure
   it shows the retry message and leaves the rendered balance untouched.
3. **implemented (design):** the panel renders the control only when
   `signedIn`; signed-out keeps the existing auth links. The control is placed
   below the status copy so it is reachable before the guide.
4. **implemented (design):** the route returns both snapshots so a future mode
   change cannot silently serve the wrong one; the client only trusts the
   response after `response.ok`.
5. **implemented:** extend `scripts/http-suite/free-allocation-checks.mjs`
   (FID-149) with the daily contract: `401` signed out, `200` with
   `mode: "daily"`, the rendered balance and no `lifetime` claim. The trial
   suite gains the lifetime contract: `200`, `mode: "lifetime"`, a non-null
   balance and `daily: null`.

### Verification

`npm run build`, then `npm run test:http`; the new contract checks run in the
same module as the panel states. Inspect the built page for the button only in
the signed-in view.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/catalog-skus.test.mjs
- gate: quality
- gate: build
- gate: http (`npm run test:http`)

### Verification Receipt

Pending implementation.

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the panel has no refresh and the only trial read is wrong for
  lifetime mode.
- **GREEN:** a mode-aware read route and a manual control that preserves the
  last good render.
- **AUDIT:** confirm the route uses the same store functions as the page, that
  `router.refresh()` re-runs the force-dynamic page, and that failures never
  write state.
- **ADVERSARIAL:** signed-out access, trial mode (daily null), daily mode
  (lifetime null), database failure, double click while a request is in flight,
  a refresh response that is `200` but carries `null`, and an expired session
  returning `401`.
- **CHANGE DELTA:** 4%; converged.

### Missed Questions

1. **Should the action poll like the account card?** No. A public model page
   should not generate background requests; the account card already polls its
   own surface.
2. **Why not reuse `/api/account/trial`?** It is daily-only by contract and
   returns `503` in lifetime mode. Reusing it would make a working trial look
   unavailable.
3. **Should the button re-render optimistically?** No. It only confirms that a
   read succeeded, then asks the server for the real render.
4. **What if the session expired?** The client reports the failure and keeps
   the static copy; the account is still reachable through the sign-in link.

## Implementation Evidence (REQUIRED for `closed`)

- **Commit SHA:** `a789b94`.
- **File:line ranges:** `app/api/account/allocation/route.ts:1-74` (mode-aware
  read), `components/catalog/free-allocation-check.tsx:1-80` (manual control),
  `components/catalog/free-allocation-panel.tsx:14,268-276` (render),
  `scripts/trial-http-suite.mjs` (lifetime contract).
- **Gate output:** `node scripts/http-suite.mjs` ended `776 checks PASS`,
  including `allocation read returns 200`, `allocation read names the active
  mode`, `allocation read returns the rendered balance`, `daily allocation read
  makes no lifetime claim` and `signed-out allocation read is refused`.
  `npm run typecheck`, `npm run quality` (PASS, 400-line ceiling), `npm run
  build` and the 959-test unit run exited 0.
- **Reproducibility:** `grep -rn "api/account/allocation" app components` finds
  the route and the control; `grep -n "lifetime allocation read"
  scripts/trial-http-suite.mjs` finds the mode-specific checks.
- **Step statuses:** steps 1-5 implemented.
- **Limitation:** the lifetime contract checks were added to the trial suite but
  not executed in this session: that suite requires a real PostgreSQL endpoint
  (`requireReal`) and this host has neither Docker nor a local server. The daily
  path was executed against the production build.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: the built page serves the client control
  and the route answers `401`/`200` as asserted
- [x] FID status reflects the actual implementation state, with the lifetime
  execution named as a limitation

### Loop 2 — Independent audit and self-correction

- **RED:** `/api/account/trial` looked reusable but returns `503` with a null
  trial in lifetime mode. Reusing it would have made a working trial look
  unavailable on the model page.
- **GREEN:** a mode-aware route that reads `trialBalance` or
  `getDailyTrialSummary` with the same flag as the page.
- **AUDIT:** the client only accepts `mode: daily|lifetime`; a `200` with an
  unknown shape is treated as a failure and leaves the last render untouched.
- **ADVERSARIAL:** double click while checking is blocked; a failed read keeps
  the server-rendered balance; `router.refresh()` cannot show a guessed value
  because the control never writes state.
- **CHANGE DELTA:** 6%; converged.

### Loop 3 — Final convergence

- **RED:** the lifetime branch has no local execution proof.
- **GREEN:** the trial suite now asserts the mode, the null daily snapshot and
  the granted balance against a real PostgreSQL endpoint.
- **AUDIT:** daily execution passed; lifetime execution is named as a CI/host
  requirement, not claimed.
- **ADVERSARIAL:** a session expiry returns 401 and the control reports the
  failure without hiding the page's static copy.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** free SKU pages now offer a manual **Check now** control
  that reads the mode-appropriate snapshot, reports the check time, refreshes
  the server render and preserves the last good balance on failure.
- **Tests Added:** Yes — daily route/page checks in
  `scripts/http-suite/free-allocation-checks.mjs`; lifetime contract checks in
  `scripts/trial-http-suite.mjs`.
- **Verification Evidence:** 776-check HTTP suite, typecheck, quality, build and
  959-test unit run; lifetime suite not run locally (real PostgreSQL required).
- **Archived:** 2026-11-03 — `dev/fids/archive/`.

## Lessons Learned

A refresh endpoint has to return the same snapshot the surface renders. Naming
it after one billing mode makes the other mode look broken.

## Lessons Learned

A read endpoint named after one billing mode cannot serve a panel that supports
two. The endpoint has to name the mode and return the snapshot the surface
actually renders.
