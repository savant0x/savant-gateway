# Savant Gateway launch plan

Executable planning outline: [master FID-2026-1030-043](../dev/fids/FID-2026-1030-043-launch-master.md)
and its nineteen child FIDs. Each is document-converged; implementation and real
acceptance remain open. [Per-file Perfection Loop evidence](../dev/audits/2026-10-30-launch-fid-perfection-loop.md).

Prepared 2026-10-30 under SCOPE H2. Status: launch is blocked pending the
operator inputs and acceptance evidence below. This document is an execution
plan, not deployment authorization or a claim of production acceptance.

## Launch contract

Ship a gateway where a customer can understand the available models and prices,
create an account and scoped key, make a completion, see accurate usage and
balance, and receive an honest refusal when capacity or credit is exhausted.
If paid access is offered, a real completed payment must become credit exactly
once and support a funded paid upstream request with exact settlement.

Standing decisions: keep subscriptions implemented but unsold; keep lifetime
trials disabled until their prerequisites pass. Daily shared free allocation
is the existing operating path. The earlier lifetime-trial journey in
[launch readiness](launch-readiness.md) is a conditional offering proposal,
not permission to activate it.

Launch covers downstream Chat Completions, including SSE. Native downstream
Messages/Responses, automatic provider failover, and multi-instance deployment
are not implemented capabilities and must not be advertised. The operator must
approve any addition to the launch contract before public claims change.

## Ownership, sequencing and evidence

Engineering executes repository work under converged FIDs, repairs demonstrated
defects, runs gates and attaches receipts. The operator supplies external
accounts/funding, selects commercial policies and hosting, and approves release.
Payment-provider and upstream behavior require real service acceptance.

The phase numbers below express dependencies, not promised calendar dates.
Set the launch date only after phases 0–5 pass and the operator-controlled
actions are scheduled. No phase is complete on the strength of a green build
alone. Record dates, commit SHA, configuration names and redacted observations;
never store secrets, customer keys, full prompts or payment details in evidence.

| Phase | Work and dependencies | Exit evidence | Responsible |
| --- | --- | --- | --- |
| 0 | Organize current work and reconcile FID/Git state | Explicit commits, accurate queue, fresh full verification receipt | Engineering |
| 1 | Freeze launch offering, limits, prices and policies | Dated operator decisions and accurate public copy | Operator + engineering |
| 2 | Complete deeper systems checks and repair findings | Review matrix, regression tests, reachable production fixes, full gates | Engineering |
| 3 | Prepare persistent deployment and operations | Restore drill, secured HTTPS service, monitoring and rollback receipt | Operator + engineering |
| 4 | Configure funding/payment prerequisites | Funded upstream, protected credentials, reachable signed webhook | Operator |
| 5 | Run real customer/payment/inference acceptance | Redacted end-to-end receipt on release candidate | Operator + engineering |
| 6 | Launch controlled traffic after explicit approval | Approved SHA/configuration, smoke receipt and active monitoring | Operator + engineering |
| 7 | Review first day/week and authorize expansion | Reconciliation, capacity/cost/error evidence and support review | Operator + engineering |

## Phase 0 — Repository and records

Preserve inherited changes and local artifacts. Review tracked differences and
new source files before explicit path-scoped staging. Archive committed FIDs
only after verifying described code and recording its SHA. Correct premature
closure metadata rather than inventing retrospective commit evidence.

Run `npm run verify` (lint, typecheck, unit tests, quality, build, HTTP and trial
HTTP suites), attribution guard and whitespace checks. Record the actual
counts/output. A local mock proves application behavior, not an upstream or
payment service. Keep research labelled as decision input rather than code truth.

## Phase 1 — Offering and commercial decisions

| Decision | Current position | Required ruling/evidence |
| --- | --- | --- |
| Free offering | Daily 90/10 shared allocation and per-account cap implemented | Publish actual limits, reset boundary, shared capacity caveat and abuse rules |
| Lifetime trial | Disabled | Decide whether activation belongs in launch; if yes, verification delivery, exact model pairs, grant budget and exhaustion/paid transition must pass |
| Subscriptions | Keep implementation, sell no plans | Confirm no active purchasable plans; changes require a new offering decision and recurring-payment acceptance |
| Prepaid access | Implemented, real acceptance missing | Select launch models and prices, fund upstream and pass phase 5 |
| Upstream allowance/RPM | Historical account observations only | Refresh real account limits and terms; verify resale permission and actual per-model rates before publishing savings claims |
| Billing treatment | Prompt/output micro-dollar math implemented | Decide treatment of cached/reasoning/tool usage and map actual provider billing fields; disclose estimation where necessary |
| Customer policies | v1.1 published and effective 2026-10-30; acceptance recorded per version | Close the pre-launch policy gates below; any text change is a new version with re-acceptance |

Use [business model](business-model.md), [research brief](business-plan-research-prompt.md)
and `docs/research/` as inputs. Reconcile every quantitative claim with measured
provider costs and operating limits; research is not an acceptance receipt.

Public launch cannot proceed while the offering is ambiguous. Disabled features
must stay absent from promises and purchase paths. If lifetime trials remain
disabled, do not describe ordinary daily free access as a lifetime trial.

### Pre-launch policy gates

These are the items policy v1.1 could not settle, deferred deliberately because
they depend on hosting, registration or payment setup that does not exist yet.
They are launch gates, not launch blockers for development work. Each closes with
written evidence, not intent, and each text change ships as a new policy version
(see `docs/policies/README.md`) with the acceptance prompt already built.

- [ ] **Registered identity and postal address.** v1.1 states that the operator
  is not registered as a separate legal entity and that a postal address is
  available on request. Close by registering, then publishing the entity form and
  address in terms §8 and privacy §1. Evidence: the new version live, the
  placeholder sentence removed, no address invented earlier.
- [ ] **Retention facts against the chosen host.** Terms claim 30-day log
  retention and 30-day backups with deletions not propagated. Both are statements
  about the host, not the application. Checked against the then-leading candidate
  (Vercel, since rejected) on 2026-10-30: Vercel keeps runtime logs for **1 hour
  on Hobby, 1 day on Pro and 3 days on Enterprise**, with Observability Plus
  extending retention to about 30 days. Close during Phase 3 by selecting the plan and either matching the
  configuration or changing the numbers in a new version. Evidence: the plan and
  setting actually in use, plus the published sentence that matches it.
- [ ] **Role contact address on an owned domain.** The contract contact is
  currently a personal mailbox. Close with a domain and a monitored role address
  in `lib/legal-meta.ts` and the body text. Evidence: a delivered test message to
  that address, and `rg` showing no personal address in policy text.
- [ ] **Tax position matched to code.** v1.1 says no tax is calculated or
  collected, which is what checkout does. If Stripe Tax is enabled before launch,
  checkout must send `automatic_tax: { enabled: true }` (and tax-id collection)
  **and** the tax paragraph must change in the same version. Doing one without
  the other makes the documents false. Evidence: the checkout payload and the
  published paragraph agree, plus Stripe's tax registration state recorded.
- [ ] **Stripe business profile and refunds.** A missing address stops being
  cosmetic when Stripe reviews the account or a chargeback arrives. Close by
  completing the business profile and rehearsing one refund in test mode, since
  card refunds are manual dashboard actions with no code path. Evidence: the
  rehearsal and the outlined steps in the support runbook.
- [ ] **Deletion can actually be performed at launch.** Deletion is manual and
  audited today. Close by executing one end-to-end deletion on a disposable
  account and confirming the cascade plus the retained, de-identified usage rows
  match the privacy notice. Evidence: before/after row counts and the resolution
  note left on the request.
- [ ] **Counsel review decision.** No lawyer has read the text. Close by either
  obtaining a review or recording a dated operator decision to launch without
  one. Evidence: the decision, or the reviewer's comments and the resulting
  version.
- [ ] **No silent claim drift.** The privacy notice says no advertising or
  analytics scripts are loaded and no CSP header is sent. Adding analytics,
  marketing tags, a CDN that logs differently, or a CSP before launch requires a
  matching version. Evidence: a pre-launch inventory of third-party scripts and
  headers, reconciled with the notice.
- [ ] **Plans stay unsold, or the terms grow the sale terms.** If any plan becomes
  purchasable, terms must state price, interval, included allowance, overage and
  renewal before the first sale. Evidence: no purchasable plan at launch, or the
  published sale terms plus recurring-payment acceptance.
- [ ] **Language.** English is the only published language. If launch copy is
  translated, state which language is authoritative in a new version. Evidence:
  the stated authority and a translation that matches the served English text.

## Phase 2 — Deeper systems verification

Execute in this order and record coverage/findings in the
[systems review](../dev/audits/2026-10-30-systems-review.md):

1. Request validation and admission: malformed JSON/shapes/budgets, auth ordering,
   disabled models/providers, rate buckets, concurrent holds, exact exhaustion,
   shared provider limits, quota freshness/reset and cross-mode interaction.
2. Settlement and money: integer arithmetic, ledger/balance agreement, unequal
   rates, overruns, replay, expired holds, JSON/SSE usage, cancellation, timeout,
   malformed upstream output, missing usage and failed durable writes.
3. Identity and isolation: signup/login/logout, suspension, session expiry and
   revocation, key scope/revocation, foreign-origin mutations, admin protection,
   proxy/Host trust, error/log redaction, brute-force and signup abuse.
4. Payments and subscriptions: signature, amount/currency/ownership, duplicate
   and reordered events, pending/paid failures, invoice periods, immutable
   snapshots, renewal/cancel/past-due handling and ledger reconciliation.
5. Provider/catalog lifecycle: additive migration, sync isolation, manual prices
   and group assignments, delisted/disabled/hidden semantics, benchmark outage,
   lease recovery, stale data, quota and visible attribution.
6. Customer experience: empty/error/exhaustion states, payment-return honesty,
   mobile/keyboard/focus/contrast, accurate local timestamps and UTC resets,
   real docs/client examples, and clear recovery/support instructions.

Every demonstrated defect receives a FID, executable reproduction where useful,
and repair plus verification in the same work pass. A named external dependency
may block acceptance; it does not turn an unverified system into a passing one.

## Phase 3 — Deployment and operations

> **Superseded 2026-10-30 — retained as decision history.** The Vercel/libSQL
> path below was rejected. The selected topology is one Fly Machine with one
> persistent local volume; see [hosting-decision.md](hosting-decision.md) and
> [deployment-runbook.md](deployment-runbook.md). The database-move premise and
> the "SQLite is a placeholder" ruling no longer apply.

### Rejected candidate: Vercel (historical)

**Historical ruling, superseded 2026-10-30 by the hosting decision.** The
migration below was planned work, not a Vercel penalty, and the host decision was
judged on what it added *after* the database move.

Vercel was the leading candidate and is **not compatible with this application as
built**. Checked against Vercel's documentation, not memory:

| Requirement in this repository | Vercel |
| --- | --- |
| SQLite at `DB_PATH`, `better-sqlite3`, WAL, one writer | Not supported. Functions have a read-only filesystem with an ephemeral `/tmp`; Vercel's knowledge base states storage is ephemeral per instance, so SQLite cannot be used |
| Balances, holds, ledger and settlement across requests | Each instance would get its own throwaway database; financial state would diverge |
| Per-process rate limiters (`lib/customer-rate-limit.ts` says "SQLite deployments run one app process") | Limits reset per instance, so signup, login, support and top-up bounds degrade to per-instance best effort |
| Backups of `data/gateway.db` | No persistent file exists to back up |
| Runtime log retention | 1 hour on Hobby, 1 day on Pro, 3 days on Enterprise; Observability Plus extends to about 30 days |
| Commercial operation | Hobby is restricted to non-commercial, personal use; a paid gateway needs Pro |
| Streaming SSE with settlement in the same request | Streaming is supported; the settlement write still needs the external database |

Two paths, sharing one prerequisite (the database move):

**A. A persistent Node host + the production database.** A VPS, container host or
PaaS with a durable volume adds no serverless constraints: a long-lived process
can hold a normal pooled client, the limiters stay in-process and correct, and the
backup method is whatever the database engine offers. Cheapest path that
preserves the verified behavior.

**B. Vercel Pro + the production database + shared rate limiting.** The database
is required either way; what Vercel adds is a per-invocation connection model and
the need for a shared limiter, because there is no single process to hold state.
Backups and log retention become the provider's, so the privacy notice changes in
a new version.

The database choice must satisfy, independent of host:

- ACID transactions spanning the hold, the ledger entry and the usage row, since
  settlement currently writes them together and `IMMEDIATE` transactions prevent
  two callers from double-spending the same balance.
- Unique constraints and idempotent upserts for every replay guard: webhook
  events, top-up fulfilment, policy acceptance, key creation.
- Read-your-writes on the balance path, or the hold math becomes racy.
- Backups or point-in-time recovery with a documented retention window, so the
  privacy notice can state a number that is true.
- A connection strategy that matches the host: pooling for serverless, or a
  single long-lived process.

A researched comparison against these requirements, with the measured port cost
and a recommendation, is in [database options](database-options.md). It is input
to the decision, not the decision, and nothing in it has been run against a real
database yet.

Do not assume a connection-string swap. The ledger, settlement recovery and
replay guards are written around synchronous SQLite transactions, so the port
includes a migration and cutover plan, re-run settlement and crash-recovery
proofs on the new engine, and a data move for any existing accounts. Do not scale process/replica count until shared
limit enforcement is proven. Record CPU/memory/storage sizing from a controlled
load test and choose traffic caps within measured upstream capacity.

Required operational evidence:

- HTTPS canonical origin, secure cookies, same-origin mutations and a production
  admin session; spoofed Host headers cannot expose operator-only routes.
- Durable SQLite volume, permissions, WAL behavior and capacity alarms. Take a
  consistent backup using a supported database backup method; restore into an
  isolated instance and reconcile users, balances, ledger and usage counts.
- Document backup frequency, retention, encryption, access, and operator-approved
  recovery-point/recovery-time targets. Demonstrate restart and migration on a
  copy before touching live data; a code rollback cannot undo a schema change.
- Monitor upstream balance/quota/RPM, 429/5xx rates, dispatch/stream latency,
  live/expired holds, settlement failures, disk/backups and webhook failures.
  Exercise an alert and its delivery to the operator; a log line is not delivery.
- Verify the production proxy's SSE buffering, idle/total timeout and disconnect
  propagation with real partial output. Check request size and resource limits.
- Reconcile balance to credit ledger, charges to usage, and provider spend to
  reported cost. Document discrepancy handling and customer-credit remediation.
- Store credentials outside Git and browser payloads; restrict access and prove
  revocation/rotation behavior without recording the values.

## Phase 4 — External prerequisites

The operator's 2026-10-29 instruction schedules wallet funding and Stripe setup
near launch; this plan preserves that timing. Record these as blocked on the
named inputs until supplied:

- Fund the serving upstream wallet and set an operating reserve/low-balance
  threshold based on the approved traffic budget. Customer top-ups do not
  automatically replenish upstream credit.
- Supply protected Stripe credentials and webhook secret; register a reachable
  HTTPS endpoint and the event set the code actually handles. Test-mode service
  acceptance and production-mode configuration are distinct evidence records.
- Verify checkout return URLs, webhook delivery/retry visibility and dashboard
  access. If subscriptions remain unsold, confirm no active purchase products.
- If trial activation is chosen, provision a transactional email service and
  verify signup ownership and recovery before enabling grant issuance.

## Phase 5 — Release-candidate acceptance

Pin the code SHA, schema state, provider configuration and offering decision.
Run local gates, then execute the following on a controlled customer account:

| Journey | Required evidence |
| --- | --- |
| Identity/key | Signup, login, key creation/use/revocation, logout/revocation and cross-account denial |
| Free access | Real JSON and SSE, correct weighted accounting, exhausted allowance and shared-limit refusal, no credit debit |
| Payment | Real hosted Checkout and service-delivered signed event, exact amount/currency, one ledger credit, replay no-op, redirect alone gives no credit |
| Paid inference | Funded real model, unequal-rate case where available, actual usage/cost/charge/ledger agreement, hold released, insufficient credit blocks next call |
| Stream failure | Cancellation, provider disconnect/timeout and missing-usage behavior; durable settlement and observable failure |
| Recovery | Process restart with in-flight work, stale holds/leases, backup restore, key/session revocation and operator access |
| Conditional trial | Only if approved: verified-email grant once, exhaustion, explicit paired paid transition, no second grant on new key |
| Conditional subscriptions | Only if offering changes: real recurring invoice, replay/failure/renewal/cancel/portal, snapshot and allowance behavior |

Preserve redacted HTTP statuses, database/ledger assertions, timestamps and
release SHA. Controlled fixtures remain part of regression coverage; they do
not replace the real service observations in this phase.

## Phase 6 — Go/no-go, launch and rollback

Go only when phases 0–5 have evidence appropriate to every offered feature,
all demonstrated blocking defects are repaired, and the operator explicitly
approves the release SHA, configuration and initial traffic cap. Any missing
payment/funding, capacity, restore, security or settlement evidence means no-go.

Launch sequence: take a consistent backup; record pre-launch balances and
configuration; deploy the approved artifact; verify public pages, auth, admin
guards, real JSON/SSE and webhook health; admit a small controlled cohort; watch
rejections, cost, holds and settlement before widening access.

Stop admitting new traffic on unexplained credit drift, duplicate payment credit,
missing settlement, isolation failure, unhealthy storage, exhausted operating
reserve, or sustained provider failures. The operator owns the stop/expansion
decision; incident response must preserve customer funds and audit evidence.

Rollback: pause admission using the deployment traffic controls; preserve logs
and take a backup; reconcile in-flight holds, usage and webhook events; restore
the last compatible artifact/configuration. Never overwrite current financial
data with an old database merely to roll back code. Replay/reconcile payments
only through idempotent fulfillment. Resume after a verified repair and operator
approval. Refunds or balance corrections require an auditable ledger record.

## Phase 7 — First day and first week

At launch, after the first real payments, after the first UTC reset, at 24 hours
and at seven days, record payment/ledger reconciliation, upstream cost versus
charges, quota/RPM saturation, errors and latency, stale holds, abuse signals,
backup/alert delivery and support issues. Expand traffic only within measured
capacity and the operator-approved spend limit. Revisit prices or trial size
from observed unit economics; do not silently change existing entitlements.

## Completion record

The operator's launch approval, exact SHA, configuration inventory, phase receipts,
incident/rollback contact and post-launch observations belong in a dated launch
receipt linked here when they exist. This plan does not claim any of them today.
