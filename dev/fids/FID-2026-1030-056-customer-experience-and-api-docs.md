# FID: Honest accessible customer experience and API documentation

**Filename:** `FID-2026-1030-056-customer-experience-and-api-docs.md`
**ID:** FID-2026-1030-056
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** implemented (policy/support pages and the remaining manual matrix
pending 061)
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

- gate: test tests/compare.test.mjs
- gate: test tests/http.test.mjs

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

Implemented the reachable defects and added a server-rendered state matrix plus a
real browser receipt. Passing earlier screenshots or typecheck does not certify a
changed candidate; disabled features still require accurate public and
crafted-request states.

## Implementation Evidence

- `app/plans/page.tsx` renders the Stripe payment paragraph only when a plan is
  actually purchasable. While sales are off the page states that plans are
  unavailable and promises no payment flow.
- `components/account/subscription-card.tsx` + `app/account/page.tsx` — with no
  subscription and sales off, the card no longer sends the customer to a catalog
  that cannot sell anything; it states that plans are not on sale. A customer
  with a comped subscription still sees the real plan and allowance.
- `scripts/http-suite/checks.mjs` — `runCustomerExperienceChecks` asserts, for
  every public page (`/`, `/models`, `/plans`, `/docs`): `200`, `lang="en"`, a
  skip link and exactly one `h1`. It also asserts the plans page no longer
  promises Stripe payment, the API reference documents `/v1/chat/completions`
  and does not advertise unimplemented `/v1/messages` or `/v1/responses`, the
  signed-in no-plan account explains the launch state without a dead plan CTA,
  and `?topup=success` / `?subscription=success` attribute credit and access to
  the signed webhook rather than claiming the balance already moved.

Browser receipt (production build, disposable database, 2026-10-30):

- `/plans`, `/models`, `/docs` at 390×844 and `/plans` at 1440×900: no horizontal
  overflow (`scrollWidth − clientWidth = 0`), one `h1` each.
- Dark theme on `/plans`: body contrast 17.14:1, muted text 8.97:1; light theme
  used for the signed-in pass.
- Signed-in account at 390 and 1440 (fresh customer): no overflow, one `h1`,
  no-plan copy and "not on sale" copy present, no "Compare plans" link, and a
  typed value in the key-name field confirmed client hydration was live.
- The global `:focus-visible` outline rule and `prefers-reduced-motion` block
  exist in `styles/savant.css`; a computed outline reading was inconclusive
  because the automation panel removes window focus between steps.

Verification: `npm run verify` exit 0 — 297 unit tests, 351 HTTP checks, trial
HTTP PASS, quality PASS (267 files), clean lint/typecheck/build.

## Remaining Gates

- Policy, privacy, terms and support routes do not exist; they belong to
  FID-2026-1030-061, which this FID depends on. Footer links are unchanged.
- 320 and 1024 widths, both themes on every page, admin screens, and a keyboard
  focus-ring screenshot were not exercised.
- Real payment success still cannot be proven without Stripe credentials; the
  account copy is verified as truthful, not as a completed purchase.

056 stays open until 061 lands and the remaining matrix is recorded.

## Lessons Learned

A label is a promise about behavior; verify both the label and its reachable action.
