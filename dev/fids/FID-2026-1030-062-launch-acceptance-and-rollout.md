# FID: Real launch acceptance, controlled rollout and rollback

**Filename:** `FID-2026-1030-062-launch-acceptance-and-rollout.md`
**ID:** FID-2026-1030-062
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-045, FID-2026-1030-046, FID-2026-1030-047, FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-050, FID-2026-1030-051, FID-2026-1030-052, FID-2026-1030-053, FID-2026-1030-054, FID-2026-1030-055, FID-2026-1030-056, FID-2026-1030-057, FID-2026-1030-058, FID-2026-1030-059, FID-2026-1030-060, FID-2026-1030-061
**YAGNI-Compliance:** Verified — accept the actual product before admitting customers.

## Summary

Collect the release candidate's real service evidence, obtain explicit release
approval, then execute bounded rollout/rollback and first-week observation. A
converged plan or green fixture suite cannot satisfy this final launch gate.

## Environment

All child contracts, `docs/launch-plan.md` phases 5–7 and the approved production
artifact/configuration. Hosting, wallet funding, keys and operator approval are required inputs.

## Detailed Description

### Problem / expected behavior / root cause

Real hosted payment, delivered webhook, funded paid inference, operational restore,
alert delivery and complete candidate journey remain unverified. Historical live
free calls and local signed events prove narrower behavior. Release needs one
dated evidence bundle linked to exact code/configuration, not a stitched claim.

### Evidence

`docs/launch-readiness.md` distinguishes fixture tests from real payment/provider
acceptance. Current session receipts show regression, not launch. 043 assigns
all A–Z owners and 060 defines measured cohort/capacity thresholds.

## Impact Assessment

Real external service use, financial transactions, production traffic, rollback
and observation. Risk critical. Wallet spend, external messages, release tags and
deployment remain explicit operator actions; silence or a planning request is not approval.

## Proposed Solution

### Approach and steps

1. Assemble every child implementation/acceptance receipt and unresolved-input
   register; pin SHA, schema, safe configuration names, offering and budgets.
2. Exercise real signup/verification/recovery/key revocation, free JSON/SSE,
   real hosted payment and provider-delivered signed event/replay, funded paid
   JSON/SSE and exact account/ledger/provider-cost reconciliation.
3. Prove refusal, cancellation, quota reset, recovery/restore and alert delivery.
   Test trial/subscription disabled branches; require additional real journeys
   only after an explicitly approved activation decision.
4. Obtain explicit go/no-go for the pinned release/cohort/budget. Take consistent
   backup, deploy approved artifact, smoke, admit controlled traffic and monitor.
5. Exercise rollback/drain without rewinding financial history; observe first
   payments, first UTC reset, 24h and 7d reconciliation before expansion approval.

### Verification

Run existing `npm run verify` on the candidate, including all newly implemented
child tests. A redacted launch receipt must contain actual statuses, ledger/
usage assertions, delivered external events, limits, timestamps and approved SHA.
Intended chain: real customer → actual ingress/app/provider/payment services →
durable accounting/monitoring/support. Mocks never replace that chain.

## Verification Gates

Planning audit under 043. Final implementation gate: `npm run verify`, attribution
guard, clean path-scoped commit and every applicable child receipt. Mandatory
external gates: real service acceptance, restore/rollback proof, delivered alerts,
approved policies/funding/configuration and explicit release authorization.

## Perfection Loop

RED: absent full real-service acceptance. GREEN: pinned evidence bundle, no-go
criteria and controlled rollout. AUDIT: pending. ADVERSARIAL: a passed code FID
can precede an external observation; verify the observation, not just archived status.
Five questions: whole customer journey, bounded spend/cohort, hostile failures,
financially safe rollback and traceable approval/observation over time.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: candidate SHA/configuration or
offering changes invalidate affected acceptance receipts. Rerun those journeys
before go/no-go; a receipt from a different candidate cannot be silently reused.
Final convergence checks are in the master planning-audit receipt.

Design only. Launch stays no-go while any offered-feature prerequisite is unmet.
Code implementation can be archived after verified commit, but master acceptance
must retain explicit external/24h/7d observation evidence before final completion.

**Cutover review 2026-11-01 — blocker register (launch no-go).** The storage
cutover is complete and `npm run verify` is green, but no external acceptance
journey has been run for this candidate. The operator accepted the fast-path
answers in [`launch-decision-form.md`](../../docs/launch-decision-form.md) on
2026-11-01: load targets are approved, and real provider spend is authorized up
to $150 for the acceptance run. That is an authorization, not a receipt. The
accepted operating envelope is $25/day paid upstream spend, 8 concurrent
customers, a 25-customer cohort, and 1 concurrency. The recommended capacity
purchase is the provider's **30-day 200 RPM subscription** ($100 list / $80
welcome, 20B free-model tokens), which raises the sustained ceiling to **3.33
rps**; the $15 / 30 RPM Boost (0.5 rps) is the fallback. The purchase is not yet
made and is separate from the $150 wallet funding. The 20 rps load target would
require 1,200 RPM, so it remains a gateway-capability target only.

Open items, each requiring a dated receipt before approval:

1. Real NOWPayments invoice and provider-delivered signed IPN, including replay
   refusal. Stripe cards remain gated off and are not a launch journey.
2. Funded paid inference against a real upstream, with account/ledger/provider
   cost reconciled exactly.
3. Restore and rollback proof on the production-equivalent PostgreSQL host; the
   local recovery drill is not a hosted restore.
4. Delivered operational alert to a real operator destination, plus first-payment,
   first UTC reset, 24h and 7d observations.
5. FID-060 load envelope re-measured against PostgreSQL and operator-approved;
   the targets are accepted, but the current measurements remain SQLite-era and
   the envelope remains `candidate`. The recommended 200 RPM plan (3.33 rps)
   still makes the 20 rps target unreachable, so the rerun must state both the
   gateway ceiling and the provider ceiling.
6. `v1.2` terms, privacy and refunds published. `v1.1` still names Stripe and
   cannot be the served text for a NOWPayments launch.
7. Hosted restore rehearsal on Neon Launch with the confirmed retention window,
   and a delivered signed alert to the operator webhook.
8. Explicit operator go/no-go tied to a pinned SHA, configuration, cohort and
   spend cap. The form records **GO for the internal acceptance run only and
   NO-GO for public launch**; without a later explicit public GO, silence is not
   approval.

## Lessons Learned

Release approval and observed operational acceptance are evidence, not documentation statuses.
