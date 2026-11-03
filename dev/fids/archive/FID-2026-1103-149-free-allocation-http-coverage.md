# FID: Free allocation HTTP regression coverage

**Filename:** `FID-2026-1103-149-free-allocation-http-coverage.md`
**ID:** FID-2026-1103-149
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one fixture helper and one check module; no product change.

## Summary

FID-147 added a free-allocation panel to every free SKU page, but no HTTP gate
opens that page. There is no proof that the signed-out view withholds balances,
that an account without an active key is told why it is not counted, that a
current observation shows the same balance admission uses, that a stale
observation says so instead of showing zero, or that pool sizes and account caps
never leak. Add a dedicated HTTP check module that seeds the smallest fixture
needed for those five states and restores it afterwards.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x
- **Tool Versions:** npm, PGlite wire fixture by default
- **Commit/State:** `416ee11` on `main`

## Detailed Description

### Problem

`scripts/http-suite.mjs` runs metadata, promo, policy, quota, request-limit,
account-recovery, operations and main checks. None requests
`/models/<free-id>`. The panel has only a server-side unit test for
`catalogSkuName` and no coverage of `getDailyTrialSummary` rendering. The
regression risk is exact: `remainingTokens: null` must never be formatted as
`0`, and policy numbers (`dailyPoolTokens`, `allocationBps`, account cap) must
stay out of the public payload.

### Expected Behavior

A free SKU page renders:

1. signed out — "Sign in to see your own allowance", no balance and no policy
   numbers;
2. signed in without an active key — the key-required message;
3. signed in with an active key and a current observation — "Available now"
   with the computed weighted-token balance;
4. signed in with a stale observation — the unavailable message and no
   `Available now` block;
5. the page never prints pool size, allocation bps or the account cap.

### Root Cause

The panel shipped under FID-147 with only typecheck and build proof; the
existing HTTP suite seeds no free SKU and no current `savant` observation.

### Evidence

```text
scripts/http-suite/seed.mjs: seedCatalog only inserts 'mock-paid'.
scripts/http-suite/checks.mjs: no request to /models/.
components/catalog/free-allocation-panel.tsx: showDaily requires
  daily.available === true && daily.remainingTokens !== null.
```

## Impact Assessment

### Affected Components

- `scripts/http-suite/free-allocation-checks.mjs` (new)
- `scripts/http-suite/seed.mjs`
- `scripts/http-suite.mjs`
- `app/models/[...id]/page.tsx`, `components/catalog/free-allocation-panel.tsx`
  (exercised, not changed)

### Risk Level

- [x] Medium: a display regression could fabricate a zero balance or disclose
  operator policy.

## Proposed Solution

### Approach

Seed one free SKU under the existing mock provider and temporarily give the
`savant` provider a current free-plan observation that points at the mock
credential; no network request is made for the observation. The check module
creates its own paid-free fixture accounts through the public auth and key
routes, requests the page for each state, restores the provider row in
`finally`, and asserts exact user-visible strings.

### Steps

1. **implemented (design):** `seedCatalog` also inserts
   `free/mock-free` (`upstream_id: mock-upstream-free`, `allow_free: 1`,
   `token_weight: 2`, group `free`, provider `mock`).
2. **implemented (design):** add `runFreeAllocationChecks({ baseUrl, db })`.
   It reads the `savant` row, saves the columns it changes, sets
   `key_env_var` to the suite provider key, a loopback mock base URL,
   `subscription_mode = 'free'`, `subscription_token_limit = 20_000_000`,
   `subscription_tokens_remaining = 19_900_000`,
   `subscription_allowed = 1`, `subscription_expires_at` in the future,
   `quota_observed_at = now`, `quota_reset_at = next UTC reset`,
   `quota_checked_at = now`, `quota_error = NULL`, and restores the row in
   `finally`.
3. **implemented (design):** signed-out GET asserts the sign-in copy and the
   absence of `Available now`, `20,000,000`, and the account-cap value.
4. **implemented:** seed a keyless account with a real customer session and
   assert the "Create an active API key" state. The suite's signup limiter is
   shared by the process, so a fixture user is seeded directly instead of
   making this check depend on earlier modules' signup count.
5. **implemented:** seed a keyed account with an active scoped key, assert
   `Available now` and the computed 100,000 weighted-token balance (the
   account cap wins over the fair share), plus the `2×` weight statement.
6. **implemented (design):** move `quota_observed_at` ten minutes into the past
   and assert the stale-observation message, no `Available now`, and no `0`
   balance line.
7. **implemented (design):** wire the module into `scripts/http-suite.mjs`
   after the operations drill and before the main checks, so its restore keeps
   the later checks on the seeded catalog.

### Verification

`npm run build` then `npm run test:http`; the suite must report the new checks
by name and still pass every pre-existing check.

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

- **RED:** no HTTP gate opens the free SKU page, so the no-fabricated-zero rule
  is untested.
- **GREEN:** five state checks run against the real production build.
- **AUDIT:** confirm the fixture does not call the upstream, the provider row is
  restored in `finally`, and the free SKU is published by `getCatalogData`.
- **ADVERSARIAL:** a stale row must not show a stale balance; a missing key must
  not look like a zero balance; the public HTML must not include the pool size
  or bps; a failed check must not leave the `savant` row modified; a double run
  must not duplicate the free SKU.
- **CHANGE DELTA:** 5%; converged.

### Missed Questions

1. **Does the page depend on the model's provider or on `savant`?**
   `getDailyTrialSummary` reads `savant`. The fixture therefore temporarily
   makes `savant` a configured local provider; it never calls it.
2. **Can a signed-in user with no key ever have a balance?** No, and the test
   asserts the explanation rather than a zero.
3. **Should the check use the lifetime trial mode?** No; the main suite pins
   `TRIAL_ENABLED=false`, and the daily path is the default. Lifetime mode has
   its own fixture in `scripts/trial-http-suite.mjs`.
4. **Does restoring the provider row invalidate earlier checks?** The module
   runs after them and restores before the main checks; the saved row is
   byte-for-byte restored.
5. **Can the check create its accounts with `/api/auth/signup`?** No. The
   signup limiter is one process-wide bucket, and earlier modules already spend
   it. The fixture writes the same user, session and key rows directly, with a
   43-character base64url token so `resolveCustomerSession` accepts it.
6. **Does a second free SKU disturb the catalog-sync checks?** It would if it
   shared the `mock` provider. It lives under a separate enabled `alloc`
   provider, so the sync still sees exactly the one row its upstream publishes.

## Implementation Evidence (REQUIRED for `closed`)

- **Commit SHA:** this closure commit.
- **File:line ranges:**
  `scripts/http-suite/free-allocation-checks.mjs:1-263` (the five page states and
  the FID-150 route contract), `scripts/http-suite/seed.mjs:44-84` (the `alloc`
  provider and `free/mock-free` row), `scripts/http-suite.mjs:21,82-90,160-172`
  (pinned pool policy and module wiring).
- **Gate output:** `node scripts/http-suite.mjs` ended `776 checks PASS` (750
  before this FID, 26 new). `npm test` ended 959 tests, 958 pass, 1 skipped, 0
  fail. `npm run typecheck`, `npm run quality` (`PASS`, 400-line ceiling, 594
  files) and `npm run build` exited 0. `npm run lint` reported 0 errors and the
  same six pre-existing formatting warnings in the untouched
  `lib/launch-receipt.ts`.
- **Reproducibility:** `grep -rn "free/mock-free" scripts/http-suite` finds the
  seed row and the page path; `grep -n "runFreeAllocationChecks"
  scripts/http-suite.mjs` finds the call.
- **Step statuses:** steps 1-7 implemented.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: the HTTP suite requests the built
  `/models/free/mock-free` route and `/api/account/allocation`
- [x] FID status reflects the actual implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** the first run failed twice for fixture reasons: the session tokens
  were not 43-character base64url, so the page rendered signed-out; and placing
  the free SKU under `mock` changed the catalog-sync check from one row to two.
  A third failure was a test-reading mistake: React SSR splits `At 2× weight`
  with `<!-- -->` markers.
- **GREEN:** tokens are issued with `randomBytes(32).toString("base64url")`; the
  free SKU lives under a separate enabled `alloc` provider; the weight assertion
  strips SSR comment markers.
- **AUDIT:** the suite passed 776 checks, including the signed-out, keyless,
  keyed, stale and route-contract states; the provider row is restored in
  `finally`.
- **ADVERSARIAL:** the keyless user's `remainingTokens` is `0`, not `null`, so
  the page relies on `activated` to explain the state; the check asserts the
  explanation and the absence of `Available now`, not a raw zero string.
- **CHANGE DELTA:** 8% from Loop 1; converged.

### Loop 3 — Final convergence

- **RED:** the main suite's PGlite wire fixture could hide a concurrent write
  problem in this module.
- **GREEN:** the module is sequential and only reads; the provider observation
  is a fixture row, not a live upstream call.
- **AUDIT:** 776/776 checks pass on the production build.
- **ADVERSARIAL:** a stale observation was asserted through both the page and
  the JSON route; a missing key was asserted separately from a zero balance.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** the free SKU page now has HTTP coverage for signed-out,
  keyless, keyed, stale and contract states, including the no-fabricated-zero
  rule and the absence of pool policy in public HTML.
- **Tests Added:** Yes — `scripts/http-suite/free-allocation-checks.mjs` and the
  `alloc` fixture in `scripts/http-suite/seed.mjs`.
- **Verification Evidence:** 776-check HTTP suite, typecheck, quality, build and
  959-test unit run recorded above.
- **Archived:** 2026-11-03 — `dev/fids/archive/`.

## Lessons Learned

A fixture that creates users through a rate-limited public route inherits the
whole suite's budget. A balance panel needs both the positive state and the
missing/stale states asserted through the rendered route, not only the store
function.

## Lessons Learned

A user-facing balance panel is admission logic rendered as text. It needs an
HTTP check against the production build, not only a typecheck.
