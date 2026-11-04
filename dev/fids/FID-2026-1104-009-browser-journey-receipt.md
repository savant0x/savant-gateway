# FID: Fresh browser journey receipt

**Filename:** `FID-2026-1104-009-browser-journey-receipt.md`
**ID:** FID-2026-1104-009
**Severity:** medium
**Status:** converged
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
- Repository HEAD `aef6730`.
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

**Planned artifact:** `scripts/browser-matrix.mjs` and its receipt are new and do
not exist at convergence. The worker adds them; this record does not claim a run.

### Verification Receipt

- verified: not yet — design converged, implementation pending.

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

Pending. Coding is reserved to the operator's separate worker.

- [ ] Commit SHA, file ranges, gate output, step statuses.
- [ ] Dated browser receipt.

## Code Verification Evidence

- [x] The prior receipt and the HTTP-only boundary were inspected.
- [x] Status reflects reality: `converged`.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Next action:** worker adds the runner and journeys, then records the receipt
  against a pinned build.
- **Archived:** no.

## Lessons Learned

Rendered HTML is not an interaction. A one-off browser pass expires with the
surface it measured.
