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
artifact/configuration. Hosting, keys and operator approval are required inputs.
Funded-wallet testing was withdrawn by the operator on 2026-11-04.

## Detailed Description

### Problem / expected behavior / root cause

Real hosted payment, delivered webhook, operational restore, alert delivery and
complete candidate journey remain unverified. Funded paid inference was removed
from the required test scope on 2026-11-04 and remains unverified; it is not a
pass. Historical live free calls and local signed events prove narrower
behavior. Release needs one dated evidence bundle linked to exact
code/configuration, not a stitched claim.

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
   real hosted payment and provider-delivered signed event/replay, and exact
   account/ledger/provider-cost reconciliation. Funded paid inference is not
   required after the 2026-11-04 operator ruling.
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
cutover is complete and the recorded verify receipt is green, but no external
acceptance journey has been completed for this candidate. One unpaid live
invoice was created on an earlier commit; see item 1. The operator accepted the
fast-path answers in [`launch-decision-form.md`](../../docs/launch-decision-form.md) on
2026-11-01: load targets are approved, and real provider spend is authorized up
to $150 for the acceptance run. That is an authorization, not a receipt. The
accepted operating envelope is $25/day paid upstream spend, 8 concurrent
customers, a 25-customer cohort, and 1 concurrency. The recommended capacity
purchase is the provider's **30-day 200 RPM subscription** ($100 list / $80
welcome, 20B free-model tokens), which raises the sustained ceiling to **3.33
rps**; the $15 / 30 RPM Boost (0.5 rps) is the fallback. The purchase is not yet
made and is separate from the $150 wallet funding. The 20 rps load target would
require 1,200 RPM, so it remains a gateway-capability target only.

Open items, each requiring a dated receipt before approval (item 1 is now
operator-accepted as an assumption, not a receipt):

1. Paid real NOWPayments invoice, provider-delivered signed IPN and replay
   refusal. One live $1.00 invoice was created on 2026-10-31 at `057f6c2`
   (id `5803921519`) but was never paid, no IPN was delivered and no replay was
   refused; that creation receipt predates this candidate and does not discharge
   the item. The live account also shows invoice `6080485510` ($10.00, no order
   id, 2026-10-31 11:55) whose origin is not recorded; it likewise does not
   discharge the item. **Operator ruling 2026-11-04:** both invoices were
   creation-only, the vendor sandbox track is dropped, and the operator directed
   that the managed service be assumed to work as wired. This item is accepted
   as an assumption, not verified; no paid invoice, provider-delivered IPN or
   replay refusal exists. Stripe cards remain gated off and are not a launch
   journey.
2. Funded paid inference against a real upstream — **withdrawn from the
   required test scope by operator ruling 2026-11-04**, verbatim: "no, let me
   be clear, i do not have a sandbox, im not going to fund a wallet to light
   money on fire to satisfy some made up requirement i did not make." No
   provider wallet is funded, no funded call is required, and no funded
   inference is claimed. The paid path remains unverified; this item is not a
   pass.
3. Restore and rollback proof on the production-equivalent PostgreSQL host; the
   local recovery drill is not a hosted restore.
4. Delivered operational alert to a real operator destination, plus first-payment,
   first UTC reset, 24h and 7d observations.
5. FID-060 load envelope re-measured against PostgreSQL and operator-approved.
   The gate is PostgreSQL-native (FID-148, closed), but its 2026-11-03 run
   completed every workload and failed five candidate targets: 4.76 admitted
   rps against 20, steady p95 1,974 ms against 1,500 ms, ramp p95 2,211 ms and
   two mixed-billing 503s. The envelope remains `candidate`. The recommended 200
   RPM plan (3.33 rps) still makes the 20 rps target unreachable, so the rerun
   must state both the gateway ceiling and the provider ceiling.
6. `v1.2` terms, privacy and refunds published. `v1.1` still names Stripe and
   cannot be the served text for a NOWPayments launch.
7. Hosted restore rehearsal on Neon Launch with the confirmed retention window,
   and a delivered signed alert to the operator webhook.
8. Explicit operator go/no-go tied to a pinned SHA, configuration, cohort and
   spend cap. The form records **GO for the internal acceptance run only and
   NO-GO for public launch**; without a later explicit public GO, silence is not
   approval.

**Verify-gate correction 2026-11-02.** `npm run verify` initially failed the
paid-account-limit HTTP check because `next start` loaded a non-default
`PAID_KEY_RPM` from `.env.local` (`expected 429, got 402`).
`scripts/http-suite.mjs` now pins `PAID_KEY_RPM=60`. In this session a full-gate
run hit the paid-limit check once (`expected 429, got 402`); `npm run test:http`
passed standalone and the immediate `npm run verify` rerun exits 0 with the unit
suite at 766 (765 pass, 1 skipped), including the USDC spike regression test and
16 direct `lib/crypto` mechanism tests, the HTTP and trial suites passing and the
recovery drill at 12/12. The pin removes the `.env.local` input; the check remains
timing-sensitive because it assumes 60 sequential probes exhaust the paid bucket
before its one-token-per-second refill. The receipt is against the working tree
at `2a28552` plus the uncommitted dependency, gate and `lib/crypto` changes; no
commit was created in this pass. The earlier receipt's counts remain
reproducible; no launch obligation is discharged.

**Acceptance prerequisite check 2026-11-02 — item 2.** Pinned candidate
`2a28552` (HEAD). This check read the configured serving account; it did not
rebuild or boot the candidate artifact, so it proves a precondition, not the
candidate's inference code. The `savant` provider at
`https://api.apinex.bond/v1` (credential variable `PROVIDER_KEY`) answered a
read-only `GET /v1/balance` with HTTP 200:

```text
balance_usd: 0
rpm: 15
rpm_plan: free
```

No paid completion was dispatched. Item 2 requires a *funded* real model, and a
$0 wallet cannot satisfy that condition; issuing the call would only exercise
the upstream refusal, not the funded path. No provider spend occurred and no
customer credit, hold, usage, settlement or ledger row was created. Item 2 was
later withdrawn from the required test scope on 2026-11-04; the historical open
status is preserved, and no funded inference is claimed.

The same check confirmed the remaining external inputs are absent:
`NOWPAYMENTS_TOPUPS_ENABLED`, `APP_URL` / `NEXT_PUBLIC_SITE_URL` and
`DATABASE_URL` are unset. A live invoice would therefore have no reachable IPN
callback, and there is no hosted restore or Neon measurement target. The
PostgreSQL load rerun (item 5) was also blocked on tooling at that time, not only
on the host: `scripts/load-acceptance.mjs` then booted a SQLite `DB_PATH`
workspace and `scripts/load/faults.mjs` imported `better-sqlite3`, so a run
through it would not produce a PostgreSQL receipt; FID-148 has since replaced
both. Launch remains no-go and no item is discharged.

**Queue audit 2026-11-03.** Content work landed at `7a2020d` (FIDs 100–102, 104
and 105) and was verified with the focused suites, `npm test` 874 (873 pass, 1
skipped), typecheck, lint, quality and build. It is public Signal behavior; no
acceptance item above is touched. This audit did not rebuild the candidate
artifact, contact the upstream, create an invoice, open a hosted database or
deliver an alert, so nothing is re-observed: items 1–8 remain exactly as
recorded, including the $0 upstream wallet, the unset production origin and
database, and the absent public GO. The candidate SHA for any future acceptance
bundle is therefore later than `2a28552` and must be pinned fresh when the
external inputs exist.

**Hardening queue audit 2026-11-03.** FIDs 128–136 and 141 were implemented and
verified locally and archived; FID 131's cancellation telemetry and FID 127's
receipt validator exist, but neither observes a real service. No hosted invoice
was created or paid, no signed IPN was delivered or replayed, no upstream was
funded, no hosted restore or rollback ran, no alert was delivered, the load
envelope was not re-measured against PostgreSQL and `v1.2` was not published.
Items 1–8 therefore remain open exactly as recorded. The README and `/docs`
state that the Vercel deployment is healthy; deployment is not acceptance, and
no item above is discharged.

**Load rerun 2026-11-03.** Item 5's tooling blocker is cleared by FID-148. The
gate ran against an isolated database in the configured Supabase cluster
(PostgreSQL 17.11, pooler port 6543), completed every workload and reconciled
with 0 unresolved settlements and `integrity: ok`, but failed five candidate
targets: ramp p95 2,211 ms, steady 4.76 admitted rps, steady p95 1,974 ms / p99
2,240 ms, and two mixed-billing 503s. The isolated database was dropped in
`finally`; the production `postgres` database was never reset. Item 5 therefore
stays open with a real PostgreSQL result, and the envelope stays `candidate`.

## Lessons Learned

Release approval and observed operational acceptance are evidence, not documentation statuses.
