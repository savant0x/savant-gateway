# FID: Fresh browser journey receipt

**Filename:** `FID-2026-1104-009-browser-journey-receipt.md`
**ID:** FID-2026-1104-009
**Severity:** medium
**Status:** closed
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The newest browser receipt is the 2026-10-31 customer matrix, written before the
current Signal interactions and account flows. HTTP checks inspect rendered HTML;
they cannot prove hydration, keyboard operation, focus return or mobile layout.
The release therefore has no fresh accessibility or interaction evidence for the
surfaces the audit names.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; disposable PostgreSQL and production build.
- Repository HEAD at convergence `aef6730`; implementation commit `0052734`.
- Receipt build ID `IbsGZjBu7Q51HrQ3KPfsT`; Playwright 1.55.0 on Microsoft Edge.
- Existing receipt: `dev/audits/2026-10-31-browser-matrix-056.md` (132/132, dated).

## Detailed Description

### Problem

Finding 12 lists journeys with no fresh receipt: command palette, video dialog
Escape and focus return, replies and reactions, catalog filters, and mobile
account flows, in both themes. The HTTP gate asserts status, HTML shape and
headers; it does not execute the client bundle.

### Expected Behavior

A dated, reproducible browser receipt against a pinned artifact covering those
journeys in both themes, with keyboard-only operation, visible focus, focus
return to the invoking control, and a mobile viewport. Failures are recorded,
not waived.

### Root Cause

Browser verification was a one-off audit step, not a gate or a repeatable script.
No current tool dependency or fixture exists for it.

### Evidence

```text
dev/audits/2026-10-31-browser-matrix-056.md   previous receipt, pre-dating current Signal work
scripts/http-suite/*                          HTML-level checks only
release audit finding 12                      named journeys absent from current evidence
```

## Impact Assessment

### Affected Components

- `components/landing/`, `components/catalog/`, `components/dashboard/`,
  `components/account/` interaction surfaces.
- Public catalog and account pages.
- Release evidence bundle for FID-2026-1103-127.

### Risk Level

- [x] Medium: a broken keyboard path or hydration error can ship while every
  HTTP check passes.

## Proposed Solution

1. Add Playwright as a dev dependency and one `scripts/browser-matrix.mjs`
   runner. No paid service and no hosted browser grid.
2. Implement six focused journeys: palette open/select/Escape; video dialog
   Escape and focus return; reply; reaction; catalog filter and Back; mobile
   sign-in, key reveal and top-up entry. Run each in light and dark.
3. Assert keyboard-only operation, focus visibility and return, no uncaught
   console error, and a 390 px viewport for the mobile journey. Capture a
   screenshot only on failure.
4. Seed a disposable database and mock upstream; the run must not touch a real
   provider, payment lane or production origin. Write a dated receipt naming the
   pinned SHA and the build id.

### Verification

RED: the current build fails at least one named journey, or the runner cannot
execute because no harness exists. GREEN: all six journeys pass in both themes,
with the receipt retained. A skipped journey fails the run; it is never reported
as a pass.

### YAGNI

Six journeys, not an exhaustive matrix. No visual-regression baselines, no
cross-browser grid, no hosted service. The existing HTTP gate keeps its role.

## Verification Gates

- gate: lint, typecheck, build.
- gate: test_http — `npm run test:http` for server behavior.
- gate: quality — `npm run quality`.
- gate: test_browser — `npm run test:browser` (manual receipt; not in `verify`).
- gate: verify — `npm run verify` on the closure tree.

**Artifact:** `scripts/browser-matrix.mjs`, the `test:browser` package command
and the dated receipt `dev/audits/2026-11-05-browser-matrix-009.md` now exist.

### Verification Receipt

- verified: 2026-11-05 — `npm run build` exit 0; `npm run test:browser` exit 0
  with 12/12 journey checks on build `IbsGZjBu7Q51HrQ3KPfsT` at commit
  `0052734`; lint, typecheck and quality exit 0. Full `npm run verify` PASS:
  11/11 gates, 1,046/1,046 tests with zero skips, 776 main HTTP checks plus the
  trial suite, recovery 14/14, 132.9 s.

## Perfection Loop

### Loop 1 — RED

- **RED:** no repeatable browser evidence for the named interactions.
- **GREEN:** one runner, six journeys, both themes, failure-only screenshots.
- **AUDIT:** the HTTP suite cannot execute client code; the old receipt predates
  the current Signal surfaces.
- **ADVERSARIAL:** a headless pass can still miss keyboard traps if the test uses
  clicks. Each journey must drive the keyboard where the behavior is keyboard.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does this need a paid browser service?** No; a local Playwright install is
   sufficient and matches the operator's build-first preference.
2. **Should the receipt run in CI?** It may, but the release receipt must name a
   pinned artifact; a flaky CI run does not replace it.
3. **What about reduced motion and high contrast?** Out of scope here; note them
   as residual gaps rather than claiming coverage.

### Loop 2 — Independent audit and self-correction

- **RED:** seeded sessions could bypass the real sign-in journey.
- **GREEN:** the mobile journey performs the real form sign-in against the
  disposable database.
- **AUDIT:** the harness already creates disposable users and sessions for HTTP
  checks and can be reused.
- **ADVERSARIAL:** screenshots on failure can leak a key if the page reveals one.
  Redact or avoid capturing key material.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** a passing local run could be mistaken for a deployed-origin check.
- **GREEN:** the receipt states the origin and artifact; deployed-origin evidence
  stays with FID-2026-1030-056-LIVE.
- **AUDIT:** no production traffic or real payment is used.
- **ADVERSARIAL:** theme switching must be asserted from the rendered state, not
  only from a class on `<html>`.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

- [x] **Commit SHA:** `0052734e87aaa69594d4878d287c30187ab1ebc6`.
- [x] **File:line ranges:** `scripts/browser-matrix.mjs:28-29` viewports;
  `:34-39` fixture ids; `:41-89` browser launch; `:127-221` schema and seeded
  content; `:224-281` theme, focus and overflow assertions; `:284-317` error
  capture and failure screenshots; `:334-498` the six journeys; `:500-594`
  theme/context orchestration; `:596-723` disposable server and receipt writer.
  `package.json:21` adds `test:browser`; `package.json:96` pins Playwright.
- [x] **Gate output:** build exit 0; browser matrix exit 0 with 12/12; lint,
  typecheck and quality exit 0; full `npm run verify` PASS (11/11 gates,
  1,046/1,046 tests, zero skips, 132.9 s). The exact browser transcript is in
  `dev/audits/2026-11-05-browser-matrix-009.md`.
- [x] **Reproducibility:** `scripts/browser-matrix.mjs` and
  `npm run test:browser` exist on `HEAD`; the runner fails when no browser or
  journey is available.
- [x] **Step statuses:** all four Proposed Solution steps implemented. Step 1:
  Playwright and one runner. Step 2: six journeys in both themes. Step 3:
  keyboard/focus/console/mobile assertions and failure-only screenshots. Step
  4: disposable database, mock upstream, local production build and pinned
  receipt.

## Code Verification Evidence

- [x] `scripts/browser-matrix.mjs`, `package.json` and the receipt exist.
- [x] Implementation matches the Proposed Solution: six journeys, both themes,
  keyboard operation, visible focus, failure-only screenshots and a pinned
  receipt.
- [x] Typecheck, lint, build and the browser run pass with pasted output.
- [x] Production call graph: the runner starts the built server, seeds the
  disposable database, signs in through the public form and exercises the
  mounted client components.
- [x] Status reflects reality: `closed`.

## Resolution

- **Closed Date:** 2026-11-05 17:49 UTC
- **Fix Description:** added Playwright, `scripts/browser-matrix.mjs` and the
  `test:browser` command; the runner covers the six named journeys in light and
  dark against a disposable database and local production build.
- **Tests Added:** 12 browser journey checks (six journeys x two themes), with
  a dated receipt at `dev/audits/2026-11-05-browser-matrix-009.md`.
- **Verification Evidence:** commit `0052734`; build id
  `IbsGZjBu7Q51HrQ3KPfsT`; build and browser matrix exit 0 with 12/12; lint,
  typecheck and quality exit 0; full `npm run verify` 11/11 gates with
  1,046/1,046 tests and zero skips.
- **Archived:** 2026-11-05; `dev/fids/archive/`.

## Lessons Learned

Rendered HTML is not an interaction. A one-off browser pass expires with the
surface it measured.
