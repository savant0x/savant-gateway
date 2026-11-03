# FID: Master launch contract and dependency register

**Filename:** `FID-2026-1030-043-launch-master.md`
**ID:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**YAGNI-Compliance:** Verified — coordinate existing implementation and explicit gaps.
**Depends on:** none

## Summary

Organize all work required for a safe Savant Gateway launch. This master owns
coverage, ordering, evidence and release decisions; nineteen children own their
implementation and acceptance contracts. The operator requested a complete
planning outline and Perfection Loop, followed by a handoff and session closure.
No launch implementation is authorized by completion of this planning session.

## Environment

Planning baseline `b0b65ac`, Windows/Node/npm, Next App Router, SQLite, single
process with process-local rate limits. Declared commands are in
`protocol.config.yaml`. Baseline receipt: 209 unit tests, HTTP 138 and trial
HTTP pass; historical service account readings are not current observations.

## Detailed Description

### Problem, expected behavior and root cause

The launch plan lists missing email delivery/recovery, cross-mode capacity,
durable failed-settlement recovery, operational proof and real payment/funded
inference acceptance. Existing code is extensive but cannot substitute for those
capabilities or evidence. Work needs bounded owners rather than one enormous fix.
Expected: every A–Z requirement has a child, every child has tests and callers,
and launch remains blocked until the actual offered product passes acceptance.

### Evidence

- `docs/launch-plan.md`: phases 0–7 and real acceptance inventory.
- `docs/trial-system-audit.md`: verified-email prerequisite without a writer.
- `lib/gateway-rate-limit.ts`: shared free bucket and separate per-paid-key buckets.
- `lib/store/billing.ts`: expired credit holds are deleted; recovery needs review.
- `dev/audits/2026-10-30-systems-review.md`: stream error repair, not durable replay.
- `docs/subscriptions-decision.md`: keep implementation, no subscription sales.

### Production truth and evidence classes

Missing production code, implemented-but-unverified behavior, external acceptance
and policy decisions are different obligations. Fixtures belong in regression
tests and never satisfy a live-service gate. `dummyHash` in login is a deliberate
password-timing equalizer, not fake customer authentication; retain its protection.
No missing subsystem may be replaced by a successful-looking stub or fabricated
quota, balance, billing period, score, health result or payment acknowledgment.

## Impact Assessment

All customer, operator, provider, financial and deployment boundaries are covered
below. Preserve historical data/keys and existing billing sources. Production
activation, spend, policy changes, release tags and deployment need explicit
operator authority. This planning change edits documentation only.

## Proposed Solution

### Approach and child register

Each link below names a plan after the document audit. A `closed` link records
committed implementation. Every child is now archived (044 `verified` with a
2026-11-01 closure body, the other seventeen `closed`). All rows require
completion evidence; a disabled offering requires a tested safety branch rather
than disappearing work.

| Child | Responsibility | Depends on |
| --- | --- | --- |
| [044](archive/FID-2026-1030-044-offering-and-economics.md) | Offering, verified rates and upstream permission — archived 2026-11-01; four offering questions answered, policy publication and funded paid-call observation open | none |
| [045](archive/FID-2026-1030-045-email-and-account-recovery.md) | Email ownership and account recovery - closed `871f19e`; live sender/inbox acceptance tracked | 044 |
| [046](archive/FID-2026-1030-046-abuse-and-request-limits.md) | Abuse, key and resource bounds — closed `bb925af`; hosted ingress acceptance tracked | 044 |
| [047](archive/FID-2026-1030-047-security-and-account-isolation.md) | Auth, isolation, boundaries and redaction — closed `2ef2d74`; ingress pinning in 057 | none |
| [048](archive/FID-2026-1030-048-shared-provider-admission.md) | Provider-wide RPM/concurrency — closed (archived) | 044 |
| [049](archive/FID-2026-1030-049-quota-and-free-access.md) | Quota refresh, reset, allocation/trial safety — closed; closure record cites `d31d9e0`, `b8a1a50` and `057f6c2`; live reset acceptance tracked | 044,045,048 |
| [050](archive/FID-2026-1030-050-usage-and-billing-fidelity.md) | Actual usage/cost and charge rules — closed (archived) | 044 |
| [051](archive/FID-2026-1030-051-durable-settlement-recovery.md) | Durable accounting and crash recovery — closed (archived) | 050 |
| [052](archive/FID-2026-1030-052-credit-reconciliation-and-adjustments.md) | Reconciliation and corrections — closed (archived) | 044,050,051 |
| [053](archive/FID-2026-1030-053-payments-and-webhook-reliability.md) | Payments, webhook atomicity and fraud — closed (archived) | 044,047,052 |
| [054](archive/FID-2026-1030-054-subscription-launch-safety.md) | Subscription lifecycle/no-sales enforcement — closed (archived) | 044,048,049,050,051,053 |
| [055](archive/FID-2026-1030-055-provider-and-catalog-integrity.md) | Provider sync, catalog and benchmarks — closed (archived) | 044,047 |
| [056](archive/FID-2026-1030-056-customer-experience-and-api-docs.md) | Honest accessible UI and real client docs — closed `1f6fb2f`; 132-page matrix verified, real payment tracked | 044,045,046,047,049,050,052,053,054,055,061 |
| [057](archive/FID-2026-1030-057-production-deployment-readiness.md) | Secure persistent production runtime — closed `b9764fe`; hosted ingress/SIGTERM tracked | 044,047,048 |
| [058](archive/FID-2026-1030-058-database-backup-and-restore.md) | Migration, backup and restore — closed `2dc005e`; live RPO/RTO and real-volume restore tracked | 051,057 |
| [059](archive/FID-2026-1030-059-observability-and-incident-response.md) | Monitoring, durable incidents and response — closed `617935b`; operator destination/scheduler/received-alert tracked | 048,049,051,052,053,057,058 |
| [060](archive/FID-2026-1030-060-load-and-resilience-acceptance.md) | Capacity and failure acceptance — closed `8c10a07`; 123/123 local measurement, operator/hosted/ENOSPC tracked | 046,048,049,050,051,055,057,058,059 |
| [061](archive/FID-2026-1030-061-policies-privacy-and-support.md) | Policies, privacy and functioning support — closed `69e050d`; operator launch gates tracked | 044,047 |
| [062](FID-2026-1030-062-launch-acceptance-and-rollout.md) | Real acceptance, approval and rollout | every child 044–061 |

### A–Z coverage

| Coverage | Child | Coverage | Child |
| --- | --- | --- | --- |
| A Offering/economics | 044 | N Subscription safety | 054 |
| B Email ownership | 045 | O Provider/catalog lifecycle | 055 |
| C Account recovery | 045 | P Benchmark provenance | 055 |
| D Abuse/resource limits | 046 | Q Accessible customer experience | 056 |
| E Authentication/isolation | 047 | R Client/API documentation | 056 |
| F Secrets/trust boundaries | 047 | S Deployment/configuration | 057 |
| G Aggregate admission | 048 | T Durable data/restore | 058 |
| H Fresh quota/reset | 049 | U Monitoring/incidents | 059 |
| I Free/trial lifecycle | 049 | V Capacity/resilience | 060 |
| J Usage/cost fidelity | 050 | W Customer/privacy policies | 061 |
| K Settlement/recovery | 051 | X Working support | 061 |
| L Credit/refund reconciliation | 052 | Y Real end-to-end acceptance | 062 |
| M Payments/webhooks/fraud | 053 | Z Release/rollback/observation | 062 |

### Steps and execution waves

1. Converge all twenty documents, audit coverage/dependencies and write handoff.
2. Execute 044 and 047; 044 records offering decisions without silently changing
   trial-off/no-plan-sales. In parallel scheduling terms, independent work can
   follow, but this repository remains single-agent.
3. Implement 045/046/048/050/061/055 as dependencies permit; then 049/051/052/053.
4. Complete 054 safety branch, 057/058/059; then 056 and 060 on a fixed candidate.
5. Complete 062 real acceptance and obtain explicit go/no-go approval.

Steps 2–5 are future execution obligations, not work claimed by this planning
session. Reopen a converged document if source or provider contracts changed.

### Decisions and blockers

044 owns offering/limits/real rates and resale permission. 045 needs a selected
email transport and controlled inbox. 053 needs Stripe credentials/HTTPS events;
057 needs hosting/domain/storage inputs; 059 needs alert destinations; 061 needs
approved policies/support ownership; 062 needs funded upstream and release
approval. Code preparation can proceed without pretending those inputs exist.
Historical B1/B4/B6/B7/B8 map to 044/048/053/054/062, preserving obligations.

## Verification Gates

Planning gates: local link/source/test inventory, dependency acyclicity, all
twenty SCOPE registrations, A–Z coverage and per-file audit receipts. Also run
`npm run verify`, `node scripts/attribution-guard.mjs`, `git diff --check`.
Implementation gate for every child: actual code/tests/callers plus its stated
acceptance receipt and commit. Current tests passing does not prove future code.

## Perfection Loop

Loop 1 RED/GREEN: scope gaps and source baseline above; create bounded owners,
operator gates and an ordered graph. AUDIT: pending cross-document review.
ADVERSARIAL: a fully green regression suite can still mask an unfunded provider,
a dead recovery path or a release without a restore/rollback receipt.
Five questions: bound aggregate workload, reject hostile inputs, keep data
recoverable, reuse shared contracts and require reproducible service evidence.

## Resolution

FID-2026-1030-063 is a supplemental defect repair under 049: current upstream
account observations and daily allocated trial credits. It carries its own
committed implementation/verification receipt; it does not close 049 or authorize
commercial launch, funding, subscription sales or deployment.

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: code closure does not discharge
unobserved service acceptance. Keep its receipt obligation in this master until
observed; all twenty slots are allocated, so new findings extend the owning child
or follow committed closure before another FID is allocated. Final passes are
recorded in `dev/audits/2026-10-30-launch-fid-perfection-loop.md`.

Converged launch plan; every child is archived with committed implementation,
but no real acceptance or release is completed. Master closure requires every
child outcome and the final launch decision/evidence. Children
with archived implementation must retain links to separate real acceptance
receipts where observation is still required. A closed code FID is not launch approval.
FID-060's local load/fault implementation is closed against `8c10a07`; the
operator-approved envelope, real provider budget, Fly volume/ENOSPC and hosted
proxy receipt remain `FID-2026-1030-060-LIVE`.

**Cutover review 2026-11-01.** FID-085/086 are archived with 2026-11-01 closure
bodies; their `Status:` field remains `verified`, which FID-086 records as the
intended state for a verified implementation. The application runs on
one PostgreSQL handle, the storage contract gate is green (`npm run
storage:check`), and the recorded 2026-11-01 verify receipt is 749 tests (748
pass, 1 skipped), HTTP 750 + trial and recovery 12/12. That receipt assumed the default
`PAID_KEY_RPM`; see the 2026-11-02 correction below. The cutover removes the
storage blocker from launch, but it does not approve launch. The remaining blockers are
owned as follows: FID-044's four offering questions are answered (free share on
`allow_free` only; $50 reserve / $50 alert / $25 hard stop; no-refund text
approved for `v1.2`; rate card and 2.5× markup confirmed), leaving only policy
publication and a funded paid-call observation; FID-062 has no real hosted
payment/webhook/funded-inference, restore/rollback, delivered-alert or 24h/7d
observation receipt, and the FID-060 load targets are accepted but not
re-measured against PostgreSQL; FID-068 remains blocked on chain/token
confirmation, an xpub, an RPC endpoint and a screening ruling; the operator
selected the NOWPayments hosted lane for launch in the 2026-11-01 decision form
(§1.5), so the direct lane is not a launch path. The accepted launch envelope is $25/day paid
upstream spend, 8 concurrent customers and a 25-customer cohort; the provider's
recommended 30-day 200 RPM subscription ($100 list / $80 welcome) is 3.33 rps,
so the 20 rps target is a gateway-capability target only and is not available as
launch capacity; the $15 / 30 RPM Boost is the fallback. `v1.2`
terms/privacy/refunds must be published before NOWPayments can be served. The operator recorded **GO for the internal acceptance run and
NO-GO for public launch** in the launch decision form.

**Status correction 2026-11-02.** Ground-truth audit at `2a28552`:
- The child register above was stale: 044 and 048–055 were already archived
  implementations, not unimplemented plans. The rows now say so.
- `npm run verify` was re-run. At the time of the gate repair the unit suite ran
  750 (749 pass, 1 skipped) with the USDC spike regression test; after the
  `lib/crypto` extraction it runs 766 (765 pass, 1 skipped), including 16
  direct mechanism tests. The recovery drill reproduces 12/12. The HTTP suite
  failed the paid-account-limit check (`expected 429, got 402`) because
  `next start` loaded a non-default `PAID_KEY_RPM` from `.env.local`;
  `PAID_KEY_RPM=60 npm run test:http` passed. `scripts/http-suite.mjs` now pins
  `PAID_KEY_RPM=60`, and a full `npm run verify` rerun on 2026-11-02 exits 0
  without a shell override. One later run hit the same timing-sensitive check
  once; FID-062 records the detail. The receipt is against the working tree at
  `2a28552` plus the uncommitted dependency, gate and `lib/crypto` changes; no
  commit was created in this pass. This repairs the gate; it does not change the
  launch decision.
- FID-068's step-0 spike did not reproduce because its three dependencies were
  undeclared. They are declared now, the spike passes 6/6, and
  `tests/usdc-receive-spike.test.mjs` keeps both the declaration and the six
  checks under `npm test`. The pure helpers moved into `lib/crypto/derive.ts`
  and `lib/crypto/transfer.ts` with `tests/crypto-receive.test.mjs` (16 direct
  cases), the three packages moved to runtime dependencies, and FID-068 step 4
  is now `partial`; the receipt is in FID-068.
- A 2026-11-02 FID-062 item 2 prerequisite check found the serving upstream
  wallet at `$0` on the free 15 RPM plan; no paid call was dispatched. The
  public origin, hosted database and alert destination are also unset, and the
  load runner is still SQLite-only. No acceptance step could run; the detail is
  in FID-062.
Launch remains no-go; no acceptance or release obligation is discharged.

**Queue audit 2026-11-03.** The active feature queue was completed and archived:
FIDs 100, 101, 102, 104 and 105 are `closed` at commit `7a2020d`, with focused
suites (10 cases across reactions, replies, momentum, search and status), the
full suite at 874 (873 pass, 1 skipped), and typecheck, lint, quality and build
all exit 0. That work is public Signal behavior only; it adds no payment,
provider, deployment or acceptance evidence. FID-068 remains step 4 `partial`
on four absent operator inputs; FID-062 has none of its eight external items
discharged; the operator's 2026-11-01 decision remains GO for the internal
acceptance run and NO-GO for public launch. This master therefore stays open
and no child obligation is satisfied by this audit.

**Hardening queue audit 2026-11-03.** FIDs 128–136 and 141 were implemented and
archived with check, 956-test, quality, build, HTTP and recovery receipts;
FIDs 126 and 127 are implemented but retain their missing evidence (a
disposable-PostgreSQL run and an operator receipt). This work is product and
tooling hardening. It created no payment, funded no upstream, restored no hosted
database, delivered no alert, re-measured no PostgreSQL load envelope, published
no `v1.2` policy and recorded no public GO. Every external obligation in this
register and in FIDs 062/068 is unchanged, so launch remains no-go.

## Lessons Learned

Make incomplete evidence visible and assign every boundary an owner; do not
confuse drafting a launch plan with delivering the launch.
