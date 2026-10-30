# FID: Honest accessible customer experience and API documentation

**Filename:** `FID-2026-1030-056-customer-experience-and-api-docs.md`
**ID:** FID-2026-1030-056
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-045, FID-2026-1030-046, FID-2026-1030-047, FID-2026-1030-049, FID-2026-1030-050, FID-2026-1030-052, FID-2026-1030-053, FID-2026-1030-054, FID-2026-1030-055, FID-2026-1030-061
**YAGNI-Compliance:** Verified — finish existing surfaces, no new design platform.

## Summary

Verify the whole customer journey against the approved offering and implemented
system. Remove unsupported claims and dead actions; make recovery, exhaustion,
payment outcomes and source freshness understandable and accessible.

## Environment

Public landing/models/compare/docs/plans, signup/login/account, operator/admin UI,
shared `LocalTime`, source provenance and existing design tokens.

## Detailed Description

### Problem / expected behavior / root cause

The interface is extensive and previous browser receipts exist, but they do not
prove the future release candidate. Missing recovery/support/policies, disabled
sales, estimated usage and quota changes need truthful states, not placeholder
forms. A purchase success redirect alone must not display credited funds.

### Evidence

`components/landing/site-footer.tsx` currently links models/plans/docs/account/admin,
not published policy/support routes. API docs describe Chat Completions; native
downstream Messages/Responses are not implemented. Local-time auth-gated tables
were not re-rendered in their original narrow receipt.

## Impact Assessment

Customer/operator screens, docs snippets and public copy; no brand redesign is
implied. Risk high: incorrect promises or inaccessible payment/recovery blocks.
Children supply behavior; this child verifies its presentation and real interaction.

## Proposed Solution

### Approach and steps

1. Build route/state matrix for anonymous/new/funded/exhausted/suspended users,
   disabled offerings, unavailable sources and failed delivery/payment/settlement.
2. Wire actual recovery/support/policy actions; align price, free/trial/plan labels,
   source-versus-sync timestamps and UTC allowance boundaries with implemented rules.
3. Exercise keyboard/focus/errors/contrast/reduced-motion and responsive layouts
   at 320/390/1024/1440 widths and both supported themes, including signed-in tables.
4. Execute documented request examples with a scoped key against the production
   candidate; verify JSON/SSE/tool capability claims and clear refusal/retry guidance.

### Verification

Extend `tests/compare.test.mjs`, `tests/http.test.mjs` where behavior is pure.
Browser/route receipts must name commit, state, viewport/theme, action and outcome;
screenshots alone do not prove hydration or successful payment. Intended wiring:
public/account forms → real routes/stores; docs examples → actual `/v1` endpoints;
policy/support links → 061's delivered pages/contact.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` runs the
existing named files. Add interaction checks to the existing HTTP workflow when
possible; any introduced browser runner must be wired into the declared gates.
Manual accessibility and signed-in browser receipts remain mandatory evidence.

## Perfection Loop

RED: incomplete future-journey acceptance. GREEN: source-backed state/interaction
matrix and working actions. AUDIT: pending. ADVERSARIAL: browser-native selection
can change while client hydration is dead; verify resulting data and URL behavior.
Five questions: every user/error state, accessible bounded interaction, hostile
inputs, shared formatting and truthful capability/provenance claims.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: map every public capability/price
claim to its source and reachable behavior; interaction checks must assert the
resulting state/data/URL, including signed-in and failed actions, not screenshots.
Final convergence checks are in the master planning-audit receipt.

Design only. Passing earlier screenshots or typecheck does not certify a changed
candidate; disabled features still require accurate public and crafted-request states.

## Lessons Learned

A label is a promise about behavior; verify both the label and its reachable action.
