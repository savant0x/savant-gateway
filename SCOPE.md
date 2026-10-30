# SCOPE.md — Gateway Project Review

Session: ECHO v0.1.2 single-agent | 2026-10-29 | Session autonomy level: 3

## Current Session — 2026-10-30 (support queue: 061)

Handoff continuation to unblock 056. Automation level 3, strict, single agent.
Operator-approved legal/commercial policy text and an outbound support channel
are named inputs and were not invented; the working support path was built.

- [x] **P1 — Re-audit 061 against current source.** Measured: no support or
  policy route existed, the footer had no support link, no table recorded a
  customer request, and no deletion writer exists (deletion is manual).
- [x] **P2 — Implement the authenticated queue.** `support_requests` schema and
  store, customer GET/POST with validation and a five-per-hour limit, operator
  queue and resolve action, `/admin/support`, the account card, `/support` and
  the footer link, plus `docs/support-runbook.md` with the verified retention
  behavior.
- [x] **P3 — Verification.** `npm run verify` exit 0: 305 unit tests, 376 HTTP
  checks, trial HTTP PASS, quality PASS (276 files), clean lint/typecheck/build.
  HTTP: anonymous `401`, foreign origin `403`, invalid `400`, recorded `201`,
  cross-account isolation, operator visibility with customer identity, resolve
  with note, customer sees the note; `/support` renders with one `h1`, a skip
  link and no invented contact address.

- [x] **P4 — Policy drafts for review.** Four versioned v1 drafts under
  `docs/policies/v1/` (terms, privacy, refunds, acceptable use), an index with the
  versioning rule, and a runbook link. Every document is marked
  "not published, not effective" and uses explicit placeholders plus
  "operator decision required" markers for positions engineering must not
  choose. Facts were re-verified in source: scrypt hashes, seven-day customer /
  eight-hour admin cookies, no analytics scripts, zero charge before usage,
  served usage charged on a later stream error, no credit expiry, ledger-only
  refunds, cascade deletion with usage retained and nulled.

Remaining, not claimed: operator approval and placeholders (legal entity,
jurisdiction, contact, retention periods, liability, refund positions);
publication as versioned routes; no outbound email transport; no self-service
deletion; no live outside-channel inquiry. 061 stays open in `dev/fids`, which
keeps 056 open.

## Current Session — 2026-10-30 (customer states and accessibility: 056)

Handoff continuation in dependency order after 055. Automation level 3, strict,
single agent. 056 depends on 061 (published policy/support), which is not
implemented; this pass fixes the reachable claim/state defects and records the
verified browser/accessibility receipt, leaving 056 open.

- [x] **P1 — Re-audit 056 against current source.** Measured: after the 054
  sales gate, `/plans` still promised Stripe payment under an unavailable
  catalog, and the account subscription card still linked to a catalog that
  cannot sell. Public docs already match the implemented Chat Completions API;
  payment return banners already defer to the signed webhook.
- [x] **P2 — Fix truthful states and add the matrix.** Conditional payment copy,
  a "not on sale" account state with no dead CTA, and HTTP assertions for
  language, skip link, single `h1`, plans state, documented endpoints, and both
  payment return banners.
- [x] **P3 — Browser and gate receipt.** Production build on a disposable
  database: `/plans`, `/models`, `/docs` at 390×844 and `/plans` at 1440×900 with
  zero horizontal overflow and one `h1`; dark-theme contrast 17.14:1 body and
  8.97:1 muted; signed-in account at 390 and 1440 with live client hydration and
  the no-plan state. `npm run verify` exit 0: 297 unit tests, 351 HTTP checks,
  trial HTTP PASS, quality PASS (267 files), clean lint/typecheck/build.

Remaining, not claimed: policy/privacy/terms/support routes (FID-061 dependency,
footer links unchanged), 320/1024 widths, both themes on every page, admin
screens, and a keyboard focus-ring receipt (panel focus loss made the computed
outline inconclusive). 056 stays open in `dev/fids`.

## Current Session — 2026-10-30 (provider and catalog integrity: 055)

Handoff continuation in dependency order after 054. Automation level 3, strict,
single agent. A live provider catalog and a live Artificial Analysis window stay
operator/062 boundaries; this pass proves the source boundary and preserves
stored truth.

- [x] **P1 — Re-audit 055 against current source.** Measured: any non-list
  `/models` body became an empty array, and `replaceModels([], …)` soft-delisted
  every model for that provider; a capped or error-shaped 200 could therefore
  erase the catalog. Benchmark storage already kept stale rows, but pagination,
  collapse, provenance and quota had no end-to-end receipt.
- [x] **P2 — Validate the source boundary.** One parser for `/models` envelopes
  (reject error object, HTML, `null`, shape change, all-unusable pages; accept an
  explicit empty list), cursor pagination with a bounded page count and refusal
  of a partial import, and no write until the whole catalog is read.
- [x] **P3 — Verification.** `npm run verify` exit 0: 297 unit tests, 320 HTTP
  checks, trial HTTP PASS, quality PASS (267 files), clean
  lint/typecheck/build. The suite proves a malformed 200 and an HTML 200 are
  `502` sync failures that leave the published row and its timestamp intact, a
  valid sync imports and soft-delists only absent rows, a two-page benchmark
  import follows page two, a collapsed payload is refused while measurements
  stay fresh, a dropped model keeps its own index version and date with
  `stale = 1`, and a spent quota window refuses without an upstream request.
  FID-055 closed; archive and CHANGELOG in the closure commit.

Remaining acceptance, not claimed: a live enabled-provider `/models` read and a
live benchmark window (local fixture only), a provider whose pagination cursor
is not `after_id`, and reconciliation when a public model id changes (the
`(upstream_slug, upstream_id)` unique constraint would abort that sync).

## Current Session — 2026-10-30 (subscription launch safety: 054)

Handoff continuation in dependency order after 053 and the CI repair. Automation
level 3, strict, single agent. Real recurring lifecycle acceptance, credentials
and an offering change remain operator/062 boundaries; this pass only makes the
no-sales decision enforceable and proves existing accounting still works.

- [x] **P1 — Re-audit 054 against current source.** Measured: the catalog gate is
  plan `status` and the checkout gate was Stripe configuration, so prepaid
  credentials would make a leftover active plan purchasable; no explicit policy
  existed anywhere. Convergence recorded in the FID before code.
- [x] **P2 — Implement the sales policy.** `PLAN_SALES_ENABLED` (unset = off)
  gates the public catalog, checkout (before Stripe readiness) and publishing a
  plan, while active-plan edits, comps, portal access and in-flight invoice
  activation stay open.
- [x] **P3 — Verification.** `npm run verify` exit 0: 290 unit tests, 284 HTTP
  checks, trial HTTP PASS, quality PASS (266 files), clean lint/typecheck/build.
  The suite stores an active plan and still gets an empty public catalog, crafts
  a checkout and gets `403 plan_sales_disabled`, activates a pre-existing
  in-flight invoice, then comps a subscription and proves included usage serves
  without charging credit. FID-054 closed; archive and CHANGELOG in the closure
  commit.

Remaining acceptance, not claimed: a real Stripe recurring journey (Checkout,
renewal, failure, cancellation, portal), a funded upstream wallet sized to any
allowance sold, and the offering decision that would set the flag true.

## Current Session — 2026-10-30 (CI fresh-database boot: 064)

Operator reported a GitHub Actions failure on the last push. Automation level 3,
single agent. Scope is the failing build step only; no billing, admission or
payment behavior changed.

- [x] **P1 — Diagnose the failing job.** Read the workflow and run log. The
  `build` job failed during page-data collection with `SqliteError: duplicate
  column name: family`; three workers imported `lib/db.ts` against a fresh
  database and raced the additive `hasColumn` → `ALTER TABLE` pair.
- [x] **P2 — Serialize the migration gate.** `createDb()` now runs every additive
  schema step plus seed inside one `BEGIN IMMEDIATE` transaction, `busy_timeout`
  is set before WAL so a concurrent first open waits, and `ensureColumn` treats
  losing that add race as success while still raising unrelated SQLite errors.
- [x] **P3 — Verification.** `npm run build` with a fresh `DB_PATH`, twice: exit 0.
  `npm run verify` exit 0: 283 unit tests (three migration cases), 262 HTTP
  checks, trial HTTP PASS, quality PASS, clean lint/typecheck/build. FID-064
  closed and archived; CI re-run is the remaining external confirmation.

## Current Session — 2026-10-30 (payment delivery: 053)

Handoff continuation in dependency order after 052. Automation level 3, strict,
single agent. Real Stripe Checkout/delivery, credentials, public HTTPS and final
acceptance remain operator/062 boundaries; this pass hardens the delivery path.

- [x] **P1 — Re-audit 053 against current source.** Automation level 3. Measured:
  a claim row suppressed a crashed event forever; no state/attempts/mode; top-up
  ownership unchecked; no failed/quarantined event visibility. Convergence
  recorded in the FID before code.
- [x] **P2 — Implement recoverable delivery.** Automation level 3. Durable
  claimed/processed/failed/quarantined state with stale-claim recovery, mode
  binding via `STRIPE_EXPECTED_LIVEMODE`, ownership validation, quarantine of
  mismatched checkouts without credit, and an admin payments view.
- [x] **P3 — Verification.** Automation level 3. `npm run verify` exit 0:
  280 unit tests (eight event cases), 262 HTTP checks (two route checks),
  trial suite PASS, quality PASS (265 files), clean lint/typecheck/build.
  FID-053 `verified`; archive and CHANGELOG in the closure commit.

Remaining acceptance, not claimed: real Checkout/delivery/duplicate delivery,
refund/dispute execution (053/062), automatic pending-top-up expiry, in-app
replay, and mode enforcement unless the operator sets the declared environment.

## Current Session — 2026-10-30 (credit reconciliation: 052)

Handoff continuation in dependency order after 051. Automation level 3, strict,
single agent. Real payment reversals, analytics netting and customer-facing
policy remain 053/056/062; this pass implements credit corrections and the
reconciliation equation.

- [x] **C1 — Re-audit 052 against current source.** Automation level 3.
  Measured: no reference identity, so a retried refund would credit twice; no
  refund or adjustment path; no balance-vs-ledger comparison; no opening
  baseline for legacy gaps; no admin view of the reserve or difference.
  Convergence recorded in the FID before code.
- [x] **C2 — Implement corrections and reconciliation.** Automation level 3.
  Append-only refund/adjustment rows keyed by a unique reference (replay is a
  no-op, conflicting terms are 409), refunds bounded by current credit,
  overdraw protection, dated baselines, one reconciliation equation per account
  and in total, admin API and view.
- [x] **C3 — Verification.** Automation level 3. `npm run verify` exit 0:
  272 unit tests (eight reconciliation cases), 260 HTTP checks (six route
  checks), trial suite PASS, quality PASS (262 files), clean lint/typecheck/
  build. FID-052 `verified`; archive and CHANGELOG in the closure commit.

Remaining acceptance, not claimed: real Stripe refund/dispute execution (053),
analytics revenue netting and customer history presentation (056), and the
baseline form (API only). Historic gaps stay visible; nothing is backfilled.

## Current Session — 2026-10-30 (durable settlement: 051)

Handoff continuation in dependency order after 050. Automation level 3, strict,
single agent. Production crash drills and recovery/backup coordination remain
058/059; this pass implements the durable state, atomic commit and quarantine.

- [x] **S1 — Re-audit 051 against current source.** Automation level 3. Measured:
  no durable admitted-call identity; rejected or interrupted calls left only an
  expiring hold; expired credit and subscription holds were silently refunded
  on a timer, which can make served output free; no inspection path. Convergence
  recorded in the FID before code.
- [x] **S2 — Implement durable settlement.** Automation level 3. Settlement row
  before dispatch, atomic `admitted → committed` claim inside the usage/money
  transaction with replay no-op, expired reservations quarantined with capacity
  still reserved, and one audited release path.
- [x] **S3 — Verification.** Automation level 3. `npm run verify` exit 0:
  264 unit tests (five settlement cases), 254 HTTP checks (three route checks),
  trial suite PASS, quality PASS (256 files), clean lint/typecheck/build.
  FID-051 `verified`; archive and CHANGELOG in the closure commit.

Remaining acceptance, not claimed: a killed-process restart receipt, an admin
UI for quarantined reservations, route-level quarantine behavior, and the
058/059 backup/recovery drills. Unknown outcomes stay explicit liabilities.

## Current Session — 2026-10-30 (usage fidelity: 050)

Handoff continuation in dependency order after 048. Automation level 3, strict,
single agent. Rates, cached-token pricing and wallet equivalence remain 044/062
obligations; this pass fixes measured parsing, provenance and settlement truth.

- [x] **U1 — Re-audit 050 against current source.** Automation level 3. Measured:
  the Anthropic translator fabricated zero counters and dropped cache tokens;
  the gateway zeroed a missing half of usage; the stream kept only the last
  usage frame; `usage_events` stored no components or provenance. Convergence
  recorded in the FID before code.
- [x] **U2 — Implement the usage contract.** Automation level 3. One parser
  (`lib/usage.ts`) owns totals/subsets/completeness; settlement stores cached,
  cache-write and reasoning counts plus `usage_source`; Anthropic totals include
  cache input once; streams merge frames; JSON and SSE share the resolver.
- [x] **U3 — Verification.** Automation level 3. `npm run verify` exit 0:
  259 unit tests (nine new fidelity cases), quality PASS (252 files), clean
  lint/typecheck/build, 251 HTTP checks and the trial suite PASS. FID-050
  `verified`; archive and CHANGELOG in the closure commit.

Findings owned in this pass: `lib/types.ts` reached 402 lines under the 400-line
ceiling after the provenance fields were added; the redundant comments were
removed rather than raising the limit. Remaining acceptance, not claimed: cached
rate discounts (044), provider-wallet equivalence (062), and HTTP-level assertion
of stored provenance per request.

## Current Session — 2026-10-30 (aggregate provider admission: 048)

Handoff continuation from `2026-10-30-provider-account-handoff.md`, which named
048 as the next engineering priority. Automation level 3, strict, single agent.
Provider ceilings, commercial rates and funding remain 044's operator boundary;
this pass implements the admission mechanics, not a commercial ruling.

- [x] **A1 — Re-audit 048 against 063.** Automation level 3. Confirmed the gap:
  free traffic shares one bucket and paid keys are isolated, with no
  serving-account gate; `tests/provider-admission.test.mjs` was absent. Found
  that 063's refresh made current rpm available on the free path but not on paid
  paths, so unknown capacity needed an explicit fallback rather than an outage;
  converged the trust order (current observation, then configured ceiling, else
  503 before any hold) and recorded it in the FID before coding.
- [x] **A2 — Implement the shared gate.** Automation level 3. One identity per
  upstream account (`origin|credential variable name`), RPM and concurrency
  slots acquired before subscription/free/credit holds, idempotent release on
  JSON, upstream error, invalid body and stream ok/error/cancel, truthful 429/
  503 guidance. `lib/provider-admission.ts`, `lib/gateway-provider-admission.ts`,
  `lib/gateway.ts`, `lib/gateway-stream.ts`, `lib/gateway-settle.ts`,
  `lib/gateway-paid.ts`.
- [x] **A3 — Verification.** Automation level 3. `npm run verify` exit 0:
  251 unit tests, quality PASS (250 files), clean lint/typecheck/build,
  251 production HTTP checks and the trial suite PASS. Route proof refuses the
  second call at a 1 RPM account ceiling with scope/limit/retry headers and
  recovers after re-observation. FID-048 `verified`; archive and CHANGELOG in
  the closure commit.

Findings owned in this pass: `lib/gateway.ts` exceeded the enforced 400-line
ceiling after the first wiring attempt (441) and was split into the gate
boundary and the existing paid reservation rather than having the ceiling
raised. Remaining acceptance, not implemented here and not claimed: multi-process
ceiling multiplication and measured peak capacity (057/060), and route-level
concurrent/cancelled-stream refusal observation.

## Session closure — 2026-10-30 (provider account handoff)

Operator request: "close the session and write a proper handoff, return a prompt
for me to send my next agent." Documentation only; automation level 3.

- [x] **Q6 — Handoff and session closure.** Recorded implementation `d31d9e0`,
  closure `1e47c9f`, actual verification/live receipts, the daily versus lifetime
  trial distinction, preserved research files, and active launch obligations in
  `dev/session-summaries/2026-10-30-provider-account-handoff.md`. Session complete;
  no further feature implementation starts during closure. Normal verification,
  path-scoped documentation commit and mandatory pre-push gates apply.

## Current Session — 2026-10-30 (provider account truth: 063)

Operator requests a complete trace, FID and Perfection Loop for the provider
quota mismatch, and states: "it's paramount that the downstream correctly shows
the real account value at the moment of checking and never a stale value
otherwise it breaks everything downstream for the entire platform".

Automation level 3, strict, single agent. FID-2026-1030-063 owns the demonstrated
defect and the quota-refresh portion of 049; 049's other allocation/trial launch
obligations remain active. No offering, funding or deployment is activated.

- [x] **Q1 — Complete trace and converged design.** Trace upstream → parser →
  persisted observation → operator/public readouts → free admission/settlement.
  Evidence at 15:42 UTC: stored observation October 29 21:15 UTC has 19,631,919
  used / 368,081 remaining; direct authenticated October 30 read returns 0 used /
  20,000,000 remaining and resets_at_utc October 31 00:00 UTC.
- [x] **Q2 — Repair account truth.** Fresh upstream reads on every explicit
  account check and free admission, independently of catalog sync. Bound and
  fence concurrent refreshes; never substitute cached success on failure.
  Preserve unknown, zero, unlimited and UTC reset semantics. Retain local usage
  and holds conservatively during refresh; mask stale/unavailable current values.
- [x] **Q3 — Verification and closure.** Regress the real mismatch, failures,
  reset and races; verify production HTTP callers and truthful rendered values;
  run declared gates, commit, archive with evidence and normally push. Preserve
  the two untracked operator research documents.
- [x] **Q4 — Daily trial credits.** Operator clarified "since it resets 20m
  provider wide daily" and "align the reset w/ the real values and sync our
  backend to the api". Extend the existing daily allocation, not the lifetime
  trial switch: cap the configured pool by observed upstream capacity, reserve
  before dispatch, expose the customer's daily weighted-token credits and reset,
  and keep credit-wallet money separate. Record the supplied APInex email as
  sandbox/PAYG evidence without inventing commercial rates or permission terms.
- [x] **Q5 — Clean startup build.** Automation level 3. The first production
  build exposed four warnings inherited from 057: static Node-only imports in
  Edge instrumentation and an unbounded path tracing hint. Use the documented
  Node-runtime conditional import and existing turbopackIgnore convention, then
  rerun build. Evidence: October 30 build output, four warnings, exit 0.

Q2/Q4/Q5 evidence: 242 unit tests, 242 production HTTP checks, trial HTTP all
PASS; clean lint/typecheck/quality/build. Live local HTTP 200 at 16:09:18 UTC:
$0, 0 used / 20M remaining, reset October 31 00:00 UTC. Customer and operator
figures clear while checking/unavailable. Implementation `d31d9e0`; FID-063
closed and archived with its receipt. Normal push follows the closure record.

## Current Session — 2026-10-30 (production deployment readiness: 057)

Operator request: "Implement FID-2026-1030-057 for production deployment readiness,
keeping deployment itself unexecuted until I approve it."

Session autonomy level 3, strict mode. Deployment, hosting provisioning, DNS,
secret injection and release remain unexecuted and operator-only. 057 depends on
044 (open, operator-blocked), 047 (closed `2ef2d74`) and 048 (converged,
unimplemented); the shared-admission and quota/recovery-job portions stay open
with those contracts rather than being claimed by this pass.

- [x] **R1 — Deployable production readiness.** Automation level 3. Validated
  production configuration at startup, canonical HTTPS origin, absolute
  persistent SQLite path, configured admin session, single-process indicators,
  truthful liveness/readiness with a real storage write probe, and secure
  headers. Verified by `tests/production-config.test.mjs` (11 cases) and the
  HTTP suites; the live in-flight SIGTERM drain receipt stays an open operator/
  CI item (Windows cannot exercise it) and is documented in the runbook.
- [x] **R2 — Operational record.** Automation level 3. Deployment runbook at
  `docs/deployment-runbook.md` with environment inventory, proxy/SSE
  requirements, storage and secret handling, disposition `0 vulnerabilities`
  (`npm audit --omit=dev --audit-level=high`), and the operator inputs still
  missing.
- [ ] **R3 — Closure inputs.** Blocked pending the operator's hosting/domain/
  volume decisions, 048's shared-admission contract and 051's recovery services;
  final deployment approval remains 062. The readiness work is committed and
  verified before those inputs exist.

## Current Session — 2026-10-30 (launch implementation: 044 and 047)

Operator request: "Begin implementing the launch FIDs in dependency order,
starting with 044 and 047. All twenty FIDs are document-converged; their
implementation remains open. Verify current source and inputs before proceeding,
and repeat the document audit if conditions changed. Follow single-agent ECHO,
preserve existing work, run the declared gates, and close each implementation
only with real commit and verification evidence. Keep trials disabled and
subscription sales off. Funding, external financial transactions, offering
activation, and deployment require explicit operator approval."

Session autonomy level 3, strict mode. Condition check before edits: runtime
source was last committed at `ca7710e`; the planning baseline `b0b65ac` and both
later commits are documentation only, and `git log -- lib app tests config`
shows no intervening code commit. Source, configuration and provider contracts
are therefore unchanged from the audited condition, so the document Perfection
Loop was not re-run.

- [x] **I1 — 044 evidence and reconciliation.** Automation level 3. Add the dated
  offering evidence ledger, distinguish unknown from zero, reconcile the tested
  economics without inventing fees or budget, and verify the activation paths
  that must stay closed. Evidence: `docs/offering-evidence.md`; 32 declared-gate
  tests pass; local `plans` has no purchasable row; trial defaults remain off.
- [ ] **I2 — 044 closure.** Blocked pending the six dated operator rulings named
  in the ledger: free-versus-trial offering, approved paid models and prices,
  resale permission and a confirmed rate card, fee/refund/expiry policy, funded
  budget and reserve, and permission to publish savings claims. The item stays
  active and is re-attempted when the rulings are recorded. No offering,
  activation or spend is claimed.
- [x] **I3 — 047 security boundaries and isolation.** Automation level 3. One
  redaction policy at log and durable-error boundaries; provider URLs reject
  embedded credentials and redirects are not followed; login guessing is bounded
  per account independently of forwarded headers; isolation/revocation/suspension
  and credential-echo probes added to the production HTTP matrix; `SECURITY.md`
  describes actual behavior. Implementation `2ef2d74`; `npm run verify` exit 0
  with 217 unit tests, 170 HTTP checks and the trial suite passing. FID archived.

The remaining eighteen active launch records are unchanged, unclosed converged
plans; this pass implemented the two requested starters. Trials remain disabled
and no plan is offered for sale.

## Current Session — 2026-10-30 (launch FID outline and session handoff)

Operator request: "We need to create a launch plan fid outline, You mentioned
multiple things that were 'dummy' or missing and are blockers. make all the fids
needed to safely launch. Make a 'master fid' to organize the children fids
covering a-z. Then run the full perfection loop on each one. Once completed,
write a handoff and close the session."

This is an explicitly authorized planning/documentation session, autonomy 3:
author and audit the entire launch FID set, commit verified planning records,
write the handoff and end the session. It does not instruct implementation of
the planned launch work in this session. Design convergence is not implementation
closure, launch acceptance, or permission to deploy. No trial/plan activation,
credential provisioning, wallet funding or release is performed here.

- [x] **P1 — Master launch contract.** FID-2026-1030-043; dependencies, A–Z
  coverage, evidence classes, launch gates and operator decision boundaries.
- [x] **P2 — Child authoring.** The following are registered planning deliverables,
  automation level 3; implementation remains represented by active converged
  FIDs after this planning session. None is silently removed by a disabled feature.

| Child FID | Planning coverage |
| --- | --- |
| FID-2026-1030-044 | Offering, real rates, unit economics and upstream permission |
| FID-2026-1030-045 | Email ownership and password/account recovery |
| FID-2026-1030-046 | Signup, keys, abuse limits and request resource bounds |
| FID-2026-1030-047 | Authentication, isolation, trust boundaries and secret redaction |
| FID-2026-1030-048 | Aggregate provider RPM/concurrency across billing modes |
| FID-2026-1030-049 | Quota freshness/reset, daily allocation and trial activation safety |
| FID-2026-1030-050 | Provider usage fidelity, cost and customer charge semantics |
| FID-2026-1030-051 | Durable settlement, replay and crash/expired-hold recovery |
| FID-2026-1030-052 | Credit reconciliation, refunds/disputes and financial corrections |
| FID-2026-1030-053 | Top-up/payment webhook reliability and fraud controls |
| FID-2026-1030-054 | Subscription lifecycle and enforced no-sales launch state |
| FID-2026-1030-055 | Provider/catalog sync and benchmark integrity |
| FID-2026-1030-056 | Customer UI, public claims, accessibility and client documentation |
| FID-2026-1030-057 | Secure deployment, canonical origin and configuration readiness |
| FID-2026-1030-058 | Database migration, backup and restore/recovery drills |
| FID-2026-1030-059 | Monitoring, alert delivery, operational controls and incidents |
| FID-2026-1030-060 | Load, resilience and measured capacity acceptance |
| FID-2026-1030-061 | Published customer policies, privacy and working support |
| FID-2026-1030-062 | Real acceptance, release approval, rollout/rollback and observation |
| FID-2026-1030-064 | Fresh-database migration race on parallel boot (CI build failure) |

- [x] **P3 — Perfection Loop.** Audit every parent/child against source, existing
  tests, dependencies and adversarial cases; apply measured document corrections;
  verify two consecutive convergence passes and retain per-file evidence.
- [x] **P4 — Verification and handoff.** Run repository gates, verify all FIDs
  are registered and within the 20-active limit, commit and normally push the
  records, write a complete handoff and close this planning session. Future
  implementation/real service acceptance stays open in the master and children.

Existing B1/B4/B6/B7/B8 requirements are carried into 044/048/053/054/062;
historical account balances and external availability are not fresh observations.

Planning completion evidence: all twenty FIDs are `converged` and registered;
graph 74 edges, no cycles, 19 child links valid, 67 existing references and 16
explicitly planned tests. Audit receipt records individual corrections below
10% and final passes 0%/0% for every FID. `npm run verify` exit 0: 209 unit
tests, quality 233 files, HTTP 138 and trial HTTP PASS, lint/typecheck/build
clean. Handoff: `dev/session-summaries/2026-10-30-launch-fid-handoff.md`.
This completes P1–P4's authoring/audit obligation, not child implementation.

## Current Session — 2026-10-30 (housekeeping, launch plan, systems review)

Operator request: "lets do some house keeping and organizational. then we need
to create a full launch plan, then begin checking through the deeper systems."
Session autonomy level 3. This section is the current register; earlier session
sections below retain their historical evidence and do not certify today's tree.

- [x] **H1 — Housekeeping.** Automation level 3. Reconcile active FID metadata
  and committed implementation, preserve local runtime/research artifacts,
  establish a current project index, and verify the inherited working tree.
  Contract: FID-2026-1030-041. Closure requires real implementation commits.
- [x] **H2 — Full launch plan.** Automation level 3. Write one dependency-ordered
  plan with acceptance evidence, responsibilities, decision gates, launch-day
  operations, rollback, and post-launch checks; connect existing reference docs.
  Preserve the recorded trial-off and no-plan-sales decisions.
- [x] **H3 — Begin deeper systems verification.** Automation level 3. Map the
  review order and complete an initial request/admission/settlement investigation,
  with executable regression checks and a FID for demonstrated defects. New
  findings remain part of this session's work; an audit map is not a repair claim.
- [x] **H4 — Request-root validation and stream settlement failures.** Automation
  level 3. FID-2026-1030-042: reject non-object JSON before field access in the
  completion and benchmark-refresh routes; make stream settlement failures
  observable with safe diagnostics and a failed stream, retaining transactional
  rollback. Add real route regressions on a disposable database. Evidence:
  `body.model`/`body.force` after unchecked casts and an empty settlement catch.

Completion evidence: `50758c1` commits the inherited feature work; `ca7710e`
commits the gateway repair and systems HTTP checks. Eighteen older FIDs have
commit-backed archive records. Current index, launch plan, audit and operator
decision index exist. `npm run verify` exit 0 on 2026-10-30: 209 unit tests,
quality PASS (233 files), build, HTTP 138 checks and trial HTTP all checks PASS;
lint/typecheck clean. H3 is an initial investigation, not an all-systems audit.

Current navigation: `docs/project-status.md`, `docs/launch-plan.md`, and
`dev/audits/2026-10-30-systems-review.md`. Recorded blockers B1/B4/B6/B7/B8
remain active; credentials, funding, offering changes, and deployment approval
are operator boundaries. No credential values are read into the records.

Record correction: the U1–U7 and local-time closure claims below are historical
claims made before a commit. They do not establish lawful closure. FID-033–040
must carry a verification receipt and an implementation SHA before archival.

## Current Session — 2026-10-29 (production truth for the subscription surface)

Operator ruling: **production only; test mode and dummy data are not a
category.** "none of this is 'test mode' echo means we only build for
production. So any form of 'dummy data' or anything not functional or up to spec
needs to be fully addressed." Interpreted scope recorded before the code change
(Law 2, Level 3 recorded presentation).

- [x] **T1 — Invented billing periods removed.** `readStripeSubscriptionSnapshot`
  fabricated `period_start = now` and `period_end = now + 30 days` when Stripe
  omitted the fields, and `invoice.paid` fabricated a 30-day window for an
  unknown invoice period. Both wrote a period no payment covers. Now the pure
  reader returns null periods (`lib/plan-lifecycle.ts:111`).
- [x] **T2 — Reconcile preserves stored periods.** `reconcileStripeSubscription`
  accepts nullable periods and keeps the stored value with `COALESCE`
  (`lib/store/subscriptions.ts:342`); an invoice with no datable period is
  ignored so Stripe retries (`app/api/webhooks/stripe/route.ts:242`).
- [x] **T3 — Nothing unpurchasable is advertised.** `PUBLIC_MODEL_SCOPE`
  (`lib/store/model-sql.ts:19`) drops plan-gated rows no active plan covers; the
  catalog read (`lib/store/public-catalog.ts:19`) and the public counts share it.
  Measured before: 0 plans, 10 plan-gated rows published with a "sold with a
  plan" footnote. Measured after: 34 rows with no plan, 44 with an active plan
  covering the group, 34 once drafted.
- [x] **T4 — Dead access rule removed.** `subscriptionGrantsAccess` had no
  production caller; admission is `sweepSubscriptions` plus the stored status.
  Removed with its two test assertions.
- [x] **T5 — Verification.** eslint clean, typecheck pass, 186/186 tests, build
  pass. Quality FAIL on two files already over the ceiling at HEAD (N5, N6).
  Live `listModels()` on a scratch database: 34 / 44 / 34.

Findings recorded during this pass:

- **N5 — `lib/gateway.ts` was over the 400-line ceiling (low). Resolved.**
  FID-2026-1029-032 moved model resolution, the free verdict and the upstream
  error/retry mapping verbatim to `lib/gateway-resolution.ts`: 412 → 366 lines.
- **N6 — `components/catalog/model-catalog-table.tsx` was over the ceiling
  (low). Resolved.** FID-2026-1029-032 split cells, filter bar and footnote into
  `components/catalog/`: 467 → 293 lines. Rendered `/models` verified on the
  production build (200, "34 models · 34 shown").
- With both split, `npm run quality` PASSES over 219 files; every gate is green.
- **N7 — The catalog carries no measured quality signal (low). Resolved.**
  FID-2026-1029-033 stores Artificial Analysis measurements in
  `model_benchmarks` and syncs them out of band, because three paginated calls
  against a shared 100/day free quota do not belong on a render path. The
  catalog reads the table, may start a refresh, and never awaits one.

- [x] **U1 — Benchmark column and sync (FID-2026-1029-033).** Implemented and
  closed. Schema, pure parser/matcher with eight tests, paginated source client,
  leased single-writer sync with a sanity gate, stored read model, Quality
  column and attribution footnote, admin status and refresh. Gates: eslint
  clean, typecheck, 194/194 tests, `quality` PASS over 226 files, build. End to
  end on the production build against a fixture source: 15/15 checks (sync,
  interval floor, rendered score and footnote, refusal of a collapsed payload
  with stored rows intact). No-key path: 4/4, column absent and explained. Live
  source call blocked on the key value, which is present and empty in
  `.env.local` as requested.

- [x] **U2 — Catalog table grid (FID-2026-1029-034).** Closed. Weight and the
  tool/vision glyphs left the Group cell for their own columns; prices are one
  line (`input / output`); numerals are right-aligned to shared edges at 13 px
  mono; rows use zebra bands instead of rules. The OpenRouter column was removed
  and its rate now rides in the Savant rate's tooltip; `Quality` became
  `AA Benchmark` and `vs list` became `vs OpenRouter`. Verified on the live dev
  server at 1440 and 1024 (no overflow, header and cell content edges measured
  equal) and by lint/typecheck/195 tests/quality/build.

- [x] **U3 — Brand canvas and band rhythm (FID-2026-1029-035).** Closed. The
  supplied 2048 px pattern ships as a 29 KB blurred WebP and paints under one
  86 % theme-aware veil; the landing page alternates canvas and perspective
  wireframe bands from DOM parity (so a missing plans band cannot leave two light
  bands touching), the footer closes with the same canvas, copy sits on a wash in
  the hero and the closing band, and chips and stat panels take an opaque
  `.canvas-surface` fill. Verified on the live dev server (band tones per section,
  computed veil and tile tokens, no horizontal overflow) and by
  lint/typecheck/195 tests/build.

- [x] **U4 — Model comparison (FID-2026-1029-036).** Closed. `/compare` takes
  `?a=&b=`, resolves both from the catalog with a fallback for unknown ids, and
  renders identity, Savant rates, OpenRouter list rates (matched id and blended
  delta), capabilities and the AA benchmark one attribute per line; the better
  side of each numeric row is marked. Picker keeps the pair in the URL and swaps;
  nav and `/models` both link to it. Ten pure tests cover resolution and the
  winner rule. Verified by lint/typecheck/205 tests/quality/build and on a fresh
  production server (swap, select, deep link, free-model pair, 390 px without
  sideways scroll). The shared dev server's client runtime was not hydrating, so
  interaction was verified on a clean `next start` rather than there.

- [x] **U5 — Comparison data and the winning row (FID-2026-1029-037).** Closed.
  A zero rate now names which zero it is (`Free pool` / `In plan` / `Not
  priced`), so a free-pool model no longer contradicts its own −100 % delta.
  Coding index, agentic index, median end-to-end response, release date and the
  matched AA slug are parsed, stored and rendered — all five were arriving on
  the wire and being discarded. Rows nobody measured are dropped, and `Measured`
  (dashes on every row, because the free tier publishes no per-model date)
  became `Source`. A win now highlights the row: a 5 % band on the value cells
  and a 12 % accent wash on the winning cell, replacing the caret-only mark from
  FID-036/A4. Schema growth is additive via `ensureColumn`; a forced sync through
  the admin route stored release dates on 31/31 matched models. Verified by
  lint/typecheck/205 tests/quality PASS (232 files)/build and on a fresh
  production server (served HTML: ten winner rows, `Free pool`, the new AA rows;
  1440 px without overflow). Files split to hold the 400-line ceiling:
  `components/compare/compare-rows.tsx`, `lib/benchmarks-parse.ts`.

- [x] **U6 — Catalog coverage (FID-2026-1029-038).** Closed. An audit found
  21 of 44 rows printing `—` for Savant price (free-pool and plan models have a
  zero per-token rate) and 11 of those blank in `vs OpenRouter` although their
  comparison existed; both now name included billing, and the comparison cell
  carries the real −100 %. Benchmark matching gained one fallback — a trailing
  build date on our id is stripped against an unambiguous source slug — which
  filled two rows (matched 31 → 33, `free/deepseek-v4-pro-0813` now shows its
  23.1 index). The 7 remaining dash rows are models Artificial Analysis does not
  publish. Verified by lint/typecheck/208 tests/quality PASS (232 files)/build
  and the rendered `/models` DOM on a production server.

- [x] **U7 — Hero price engine (FID-2026-1029-039).** Closed. The reported
  stale form was a dead client runtime, not a component bug: the native select
  displayed the new option while the body kept the old model, which only happens
  when nothing hydrates. The dev server on 3000 had been killed by a production
  build overwriting the shared `.next`; restarted and verified (select → id,
  rate, unit and details all update; a real pointer click on a family button
  selects that family with `aria-pressed` set). One real defect was found beside
  it and fixed: equal input/output rates printed the same figure twice, now a
  single "per 1M tokens, in and out" line, with the two-line form kept for
  differential models. Verified by lint/typecheck/208 tests/quality PASS (232
  files)/build and DOM reads on both servers; the `.next` hazard and the
  HeroUI-`onPress` harness artefact are recorded in `dev/LEARNINGS.md`.

Blocked items (specific blockers, re-attempted the moment they clear):

- **B6 — Sell plans for real.** Blocked on the operator's Stripe credentials
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.local`) and a public
  webhook endpoint. Without them checkout returns `503`, so no plan can be sold
  and no active plan can exist. Nothing in code substitutes for the credential.
- **B7 — Included-allowance capacity policy (N4).** Blocked pending an operator
  ruling on policy: included subscription usage spends paid upstream capacity
  without passing the free-pool floor or the 15 RPM ceiling.
- **B8 — Funded upstream wallet.** Blocked on operator funding; the paid balance
  is `$0`, so an included allowance routed to a paid upstream model fails upstream
  while local accounting says the customer is entitled.

## Current Session — 2026-10-29 (free-pool allocation, context banner, launch analysis)

Operator request: repair the stale records; establish how the trial credit system
is wired; split 90% of the 20M daily upstream allowance evenly across activated
accounts each day; decide whether to keep or remove subscriptions; add a
dashboard-editable context string carried by every request; optimize caching;
and produce a Gemini Deep Research prompt for an early-stage business plan.

- [x] **A1 — Stale records repaired.** `.env.example` no longer opens with the
  scaffold `[TEMPLATE]` line. The line was noise, not a boot failure: a source
  check of the dotenv parser bundled in `@next/env` 16.4.3 shows malformed lines
  are skipped by its regex loop, not thrown on. `dev/agenda.md` now records the actual launch
  agenda. `dev/audit/issues.md` is a superseded, untracked snapshot of the
  pre-rebuild review; the 2026-10-29 handoff requires it to be preserved, so it
  was neither staged nor deleted.
- [x] **A2 — Trial system audited.** `docs/trial-system-audit.md` records the
  implemented ledger and its blocker: the grant requires
  `users.email_verified_at`, and no route, form, or job writes that column. With
  `TRIAL_ENABLED=false`, a zero grant budget, and an empty pair map, no grant
  can issue. Activation requirements and the overlap rule with the daily
  allocation are stated; the trial stays off.
- [x] **A3 — Daily shared allocation.** FID-2026-1029-016. A per-UTC-day
  `free_pool_allocations` row grants each activated account
  `min(floor(0.9 x pool / activeAccounts), unallocated remainder)` inside the
  existing immediate admission transaction. Activated means an active customer
  holding at least one active key. A joining account rebalances existing grants
  down to the new fair share, floored at recorded usage plus holds, so unspent
  capacity reaches newcomers; 10% is never allocated. Admin → Gateway
  edits the pool and share, with settings overriding environment defaults.
  `.env.example` documents `FREE_POOL_DAILY_WEIGHTED_TOKENS`,
  `FREE_POOL_ALLOCATION_BPS`, and `FREE_POOL_ALLOCATION_ENABLED`.
- [x] **A4 — Context banner.** FID-2026-1029-017. One operator-authored string
  in `settings`, edited from Admin → Gateway, prepended as a leading system
  message on every upstream request while enabled, capped at 2,000 characters,
  and counted in the prompt-token estimate used by the free allocation and the
  paid hold. The same payload serves JSON and SSE, and the Anthropic translator
  folds the system message into `system`.
- [x] **A5 — Subscription decision.** `docs/subscriptions-decision.md`: keep the
  implementation, sell nothing at launch. The code is implemented and locally
  verified but real Stripe delivery is unverified and plan allowances would spend
  an unfunded paid upstream wallet. Plans stay archived/draft and Stripe stays
  unconfigured; revisit criteria are recorded.
- [x] **A6 — Catalog read cache.** FID-2026-1029-018. A generic five-second TTL
  memo wraps `listModels` only; `listAllModels` and the billing lookup
  (`getModelForGateway`) stay uncached. Measured avoided cost: 150.2 µs average
  catalog query over 300 runs against 44 active rows (read-only
  `data/gateway.db`, 20 warmups). This measures the query, not end-to-end HTTP
  latency.
- [x] **A7 — Business-plan research prompt.**
  `docs/business-plan-research-prompt.md` is a self-contained Gemini Deep
  Research brief: platform and cost model, the 20M weighted-token daily pool and
  90/10 split, 15 RPM shared limit, $0 paid wallet, abuse exposure, constraints,
  seven deliverable sections, three-scenario requirement, output rules, and a
  data snapshot. It asks for pricing, free policy, unit economics, growth,
  risk controls, and go/no-go thresholds.
- [x] **A8 — Verification.** `npm run verify` exit 0: lint zero warnings,
  typecheck exit 0, 135/135 unit tests, quality PASS over 207 files, production
  build exit 0 (54 app routes including `/admin/gateway` and
  `/api/admin/gateway`), `http-suite` 100 checks PASS, and `trial-http-suite`
  all checks PASS. Implementation committed as `58d5556`; FID-016/017/018 are
  closed against that commit and archived.
- [x] **A9 — Sequencing disclosed.** Implementation and FID authoring landed in
  the same pass at the operator's direction. FID-016/017/018 record the converged
  design and audit the code that exists; they do not claim code was written only
  after convergence. This deviation from FID-Bound Execution is recorded rather
  than masked.
- [x] **A10 — Allocation banking corrected.** FID-2026-1029-019. The first
  pass granted durable shares that never shrank, so the first account of the
  UTC day took all 90% and a later same-day signup received 0. A joining
  account now triggers a rebalance of existing grants to the new fair share,
  floored at each account's usage plus holds. Tests: 11 allocation cases
  covering an unspent 18M → 9M split, a 12M committed grant that stays 12M while
  the newcomer receives 6M, and a 9M/9M → 6M/6M/6M three-account split.

Findings recorded during this pass:

- **N1 — the trial could never issue a grant (high for any trial launch).**
  `users.email_verified_at` is read by `lib/trial-ledger.ts` but written nowhere
  in the application; no verification delivery exists. Recorded in
  `docs/trial-system-audit.md`; activation remains off.
- **N2 — per-customer free allowance had no relationship to the shared pool
  (high).** `FREE_DAILY_WEIGHTED_TOKENS` was applied per user with no account
  count, so promises could exceed 20M by an arbitrary factor. Replaced by the
  FID-2026-1029-016 allocation ledger.
- **N3 — the public catalog re-queried identical rows on every read (low).**
  Measured at 150.2 µs per query; now memoized for five seconds on the display
  path only.
- **N4 — subscription allowances bypass shared admission (medium).** Included
  subscription usage reserves against the plan period and spends paid upstream
  capacity directly, without the free-pool floor or a shared subscription/trial
  capacity policy. This is a documented launch gate in
  `docs/launch-readiness.md`, not a repaired behavior.

## Current Session — Launch continuation

- [x] **L1 — Provider metadata prerequisites.** Automation level 3. Resume
  launch work under `dev/fids/archive/FID-2026-1029-014-provider-metadata-integrity.md`:
  preserve subscription weights, context aliases, partial-source fallback and
  accurate known-cost status. Verified: 113 unit tests, 100 HTTP checks, clean
  lint/typecheck, quality and build. Committed `ae9c363`; FID-014 archived.
- [x] **L2 — Disabled trial conversion infrastructure.** Operator resumed under
  `dev/fids/archive/FID-2026-1029-015-lifetime-trial-routing.md`. Configurable amount
  with 100,000 development default; activation off, empty pairs, zero grant budget.
  Wallet funding and Stripe remain governed by the quoted launch timing.
  Concrete review proposal: `docs/trial-conversion-contract.md`, including six
  exact paired candidates and five unpaired models. Grant policy remains
  configurable rather than blocking implementation on amount selection. Final
  activation and offering decisions remain explicit launch requirements.
  Implemented and committed `d3e4a56`: durable grants/holds, explicit paid
  transition, account balances/rates, model API metadata and tests. Receipt:
  118 unit tests, existing 100 HTTP checks plus trial suite PASS, lint zero
  warnings, typecheck, quality (197 files), build and mobile account receipt.
  FID-015 closed and archived; launch activation remains disabled.

## Current Session — 2026-10-29 (launch planning and visual redesign)

Operator request: document pre-launch requirements, record wallet funding and
Stripe configuration for completion near launch, and enhance the entire site's
visual design. Brand clarification: "Savant as a brand is designed w/ cyberpunk/neon noir visuals. Cyan being the primary clogo color. W/ neon accents".

- [x] **V1 — Launch requirements.** Automation level 2. Added
  `docs/launch-readiness.md`, distinguishing the proposed one-time trial and
  paid-model transition from current daily allowances; include funding, Stripe,
  upstream quota, abuse controls, deployment, and acceptance evidence. Wallet
  funding and Stripe setup timing follow the explicit operator ruling quoted
  in that document. `npm run verify` exit 0: 107 unit tests, quality PASS over
  189 files, 51-route build, and 100 HTTP checks; `git diff --check` exit 0.
- [x] **V2 — Whole-site visual direction and review.** Automation level 3.
  Audit public, auth, account, console, and admin surfaces; prepare a concrete
  cyan cyberpunk/neon-noir design on the Superdesign canvas for review.
  Version 7 incorporates the Savant Code reference, price/quality positioning,
  and all 45 stored models. Operator `resume` authorized implementation.
- [x] **V3 — Visual implementation and verification.** Automation level 3.
  Resumed by the operator after version-7 review. Implementation contract:
  `dev/fids/archive/FID-2026-1029-013-savant-visual-system.md`.
  After visual direction approval, converge a FID, apply the shared design
  system across all site surfaces, verify responsive/accessibility behavior
  and the declared gates, and commit verified progress with closure records.
  Implementation and browser verification passed: 17 routes across two themes
  and three viewport widths (102 combinations), plus 17 interaction checks.
  Fixed discovered account/console overflow, customer setup-command exposure,
  and raw error-message rendering. Committed as `56a2436`; FID-013 closed and
  archived. Lint zero warnings, typecheck, 107 unit tests, quality (191 files),
  51-route build and 100 HTTP checks passed.

The earlier visual pass left trial implementation paused. L2 now resumes its
disabled infrastructure; activation and payment readiness remain unclaimed.

## Current Session — 2026-10-29 (subscription revenue analytics, then HTTP suite)

Operator request: make subscription plan revenue visible in the admin revenue
surfaces, then add route-level HTTP coverage. The operator selected
"Both, analytics first."

- [x] **S24 — Analytics FID authored.**
  `dev/fids/FID-2026-1029-011-subscription-revenue-analytics.md` is converged.
  It separates credit revenue from paid-invoice plan revenue, adds total
  revenue and total margin, subscriber counts, MRR, and a per-plan table, and
  leaves billing, routing, invoice recording, and Stripe handling unchanged.
- [x] **S25 — Analytics implemented and verified.** `lib/revenue.ts` and
  `lib/analytics.ts` hold the pure math and testable SQL; the admin analytics,
  overview, chart, and per-plan table consume credit and plan revenue
  separately. Committed as `ba233c6`; FID-011 closed and archived after
  `npm run verify` exit 0 (107/107 tests, quality PASS over 189 files, 51-route
  build) and a 21-check disposable-database render receipt.
- [x] **S26 — B2 route-level HTTP suite implemented and verified.**
  `scripts/http-suite.mjs` plus `harness.mjs`, `seed.mjs`, and `checks.mjs` boot
  the production build against a disposable database, seed a mock provider and
  paid model through a second SQLite connection, and run 100 HTTP checks across
  signup/session/logout/login, cross-account key ownership, signed webhook
  credit/replay/invalid/mismatch, exact paid-call settlement, unfunded
  rejection, and admin session behavior. `npm run test:http` is wired after
  build in `verify`, CI, and the pre-push hook. Committed as `4374c00`; FID-012
  closed and archived after `npm run verify` exit 0 (107/107 unit tests,
  quality PASS over 189 files, 51-route build, 100 HTTP checks).
- [x] **S27 — Session closed with a handoff.** Both FIDs are archived;
  `dev/session-summaries/2026-10-29-analytics-and-http-suite.md` records the
  session receipt, the final gate output, the unpushed-commit state, and the
  remaining B1/B4/B5 blockers.

## Current Session — 2026-10-29 (D6/D50, provider registry, and model groups)

Operator request: fix the two open audit findings — sanitize client-facing error
responses and add free-pool admission control with per-user limits,
provider-remaining enforcement, and tests — and draft a provider-registry FID
for CommandCode as a second provider, with OpenAI- and Anthropic-protocol
support behind one backend.

- [x] **S1 — D6 fixed.** `sanitizeError` in `lib/http.ts` logs details
  server-side and returns generic text for the provider fetch, the admin credit
  grant (now `500`), and provider sync (config errors keep their `400`).
- [x] **S2 — D50 fixed.** Free calls now reserve weighted tokens before
  dispatch against a per-user daily allowance and the effective provider
  remaining, with `429`/`Retry-After`/`X-RateLimit-Reset` on refusal and
  actual weighted usage settled in the usage transaction.
- [x] **S3 — Tests added.** `tests/free-pool.test.mjs` covers config, weighting,
  boundaries, reservations, the provider floor, provider block, alerts, and
  reset times; `tests/http.test.mjs` covers the sanitizer.
- [x] **S4 — FID-009 authored.**
  `dev/fids/FID-2026-1029-009-error-sanitization-and-free-pool-admission.md`
  records the implementation and the remaining gate receipt.
- [x] **S5 — FID-010 authored.**
  `dev/fids/FID-2026-1029-010-multi-provider-registry.md` is converged:
  provider entity, per-provider credentials, provider-scoped sync, OpenAI and
  Anthropic adapters, manual cost mapping, provider-scoped free pool, and
  admin controls. No provider code changed; implementation is B5.
- [x] **S6 — Records updated.** Audit report D6/D50 marked fixed, CHANGELOG,
  `.env.example`, and `knowledge.md` updated, and this scope records the new
  work.
- [x] **S7 — Verification and closure.** `npm run verify` exit 0: 62/62 tests,
  quality PASS over 127 files, 33-route build. Committed as `4782ce1`; FID-009
  is closed against that commit and archived.
- [x] **S8 — FID-010 implemented.** `providers` registry with per-provider
  protocol, base URL, credential variable name, headers, capabilities,
  enabled state, and runtime status; `models` scoped by `(upstream_slug,
  upstream_id)` with `family`, `protocol`, and `cost_source`; scoped sync that
  only delists the syncing provider's rows; OpenAI Chat Completions and
  Anthropic Messages adapters; manual cost entry that gates activation and
  survives sync; provider-scoped free-pool floors; and Admin → Providers with
  register, edit, enable/disable, delete, test, and per-provider sync.
- [x] **S9 — FID-010 verified.** `npm run verify` exit 0: 79/79 tests, quality
  PASS over 152 files, 39-route build. A disposable copy of `data/gateway.db`
  booted on the additive migration: both providers seeded, all 45 existing
  models still on `savant`, and `provider_slug` present on usage and
  reservations. Live CommandCode inference was not run: no credential. FID-010
  records the receipt, is committed as `957430c`, and is closed and archived.
- [x] **S10 — Group schema and migration.** `lib/schema/groups.ts` adds the
  `model_groups` table, seeds the three system groups, adds
  `models.group_slug`, `models.group_source`, and `usage_events.group_slug`,
  and backfills every existing model from its old access. Additive; all 45
  existing models preserved on a disposable copy.
- [x] **S11 — Group-aware billing and pricing.** `lib/model-groups.ts` holds
  pure validation, default-group, access, price-reset, and reassignment rules.
  `accessFor`, `isFreeCall`, `usagePrices`, and `recordUsage` now read the
  group billing mode. A free group zeroes prices; a paid group can charge a
  zero-cost model. Manual group assignments survive sync; auto rows follow the
  provider.
- [x] **S12 — Admin and public surfaces.** New `/api/admin/groups` (GET, POST,
  PATCH, DELETE) and `/admin/groups`; `PATCH /api/admin/models` accepts
  `groupSlug`; catalog and pricing tables have group selectors; the public
  catalog filter and labels are dynamic; `/v1/models` adds group fields while
  keeping `group` compatible.
- [x] **S13 — Verification.** `npm run verify` exit 0: 89/89 tests, quality PASS
  over 160 files, 41-route build. On a disposable DB copy: create a paid group,
  move `free/deepseek-v4-pro-0813` into it, price at $0.50/$1.00, survive a
  provider sync, and charge 160 micros on a live call with `group_slug = paid`.
  System group mode changes and deletes were rejected; delete-with-reassign and
  free-group price zeroing were exercised.
- [x] **S14 — Records and closure.** README, AGENTS, knowledge, CHANGELOG, and
  FID-007 are updated. Implementation committed as `161ddcc`; FID-007 is
  `closed` against that SHA and archived.

## Current Session — 2026-10-29 (FID-008 subscription plans)

Operator request: implement FID-2026-1029-008 subscription plans and
entitlements on top of the FID-007 model groups.

- [x] **S15 — Subscription schema.** Additive migration adds `plans`,
  `plan_groups`, `plan_models`, `subscriptions`, `subscription_models`,
  `subscription_periods`, `subscription_holds`, `subscription_invoices`, and
  `billing_events`, plus `users.stripe_customer_id` and the usage billing
  snapshot columns. One-active-subscription and one-open-period partial unique
  indexes enforce the invariants.
- [x] **S16 — Pure plan rules and tests.** `lib/plans.ts` validates slug, name,
  price, interval, status, allowance, overage, and inclusions; expands group
  and model entitlements; computes allowance decisions and overage markup.
  `lib/plan-lifecycle.ts` owns calendar periods and Stripe status mapping.
  `tests/plans.test.mjs` covers validation, expansion, exhaustion, markup,
  snapshots, month-end clamping, and status transitions.
- [x] **S17 — Stores and Stripe.** Plan CRUD and inclusion validation, snapshot
  activation, open-period metering, subscription holds, invoice upsert,
  reconcile, cancel/resume, manual grant/extend/revoke, and entitlement refresh
  are implemented. `lib/stripe-subscriptions.ts` handles customer reuse,
  checkout, portal, cancellation, and period sync. The webhook dispatches
  top-ups, checkout linking, subscription events, and paid/failed invoices with
  `billing_events` idempotency.
- [x] **S18 — Gateway enforcement.** One billing source per call: past-due
  blocks first, included plan usage reserves weighted tokens against the open
  period, exhausted `block` returns 402, exhausted `credit` charges the normal
  credit path with the snapshot markup, and an uncovered subscription-group row
  returns 403 `subscription_required`.
- [x] **S19 — Customer and admin surfaces.** Public `/plans` and
  `/api/plans`; account subscription card with allowance, invoices, cancel,
  resume, and portal; Admin → Plans and Admin → Subscriptions with create,
  edit, archive, delete, grant, extend, revoke, sync, and refresh.
  `/v1/models` adds additive `requires_subscription`; provider quota copy is
  labelled upstream; model-access docs distinguish plan-only rows.
- [x] **S20 — Verification receipt.** `npm run verify` exit 0: 99/99 tests,
  quality PASS over 186 files, 51-route build. On a disposable database through
  the real HTTP routes: active-plan CRUD and draft exclusion; a manual plan
  produced a zero-charge `billing_source=subscription` call with 6 included
  weighted tokens; a plan edit left the 23-model snapshot and $5 price intact;
  explicit refresh replaced it with 24 models; an uncovered call returned 403;
  an exhausted block plan returned 402; an exhausted credit plan charged 9
  micros with the 5000-bps markup and `billing_source=credit`; duplicate
  checkout returned 409; foreign-origin customer and admin mutations returned
  403; extend and revoke worked; a signed `invoice.paid` activated exactly one
  period and a replay was a no-op; and a signed top-up credited $5.00 once.
  Admin plans/subscriptions and customer account/plans pages returned 200.
  Real Stripe checkout, recurring invoice delivery, and a funded paid
  subscription remain unverified (B4).
- [x] **S21 — Records.** README, AGENTS vocabulary, knowledge, API reference,
  CHANGELOG, SCOPE, and FID-008 are updated.
- [x] **S22 — Replay dedupe consolidated.** The paid-invoice guard is one
  helper, `invoiceStatus` in `lib/store/subscription-rows.ts`, used by both
  `activateSubscription` and `markSubscriptionPastDue`; extracting it also kept
  `lib/store/subscriptions.ts` at 393 lines under the 400-line ceiling. Fresh
  `npm run verify` exit 0: 99/99 tests, quality PASS over 186 files, 51-route
  build. The disposable HTTP receipt was re-run on a fresh snapshot after the
  extraction with identical results: 23 snapshot entitlements growing to 24 on
  refresh, 402 on the exhausted block plan, 9 micros on the 5000-bps credit
  overage, one period after the signed replay, and one $5.00 top-up credit.
- [x] **S23 — Closure.** Implementation committed as `a945789`; FID-008 is
  closed against that SHA and moved to `dev/fids/archive/`. README, knowledge,
  CHANGELOG, and the blocker register record the closure.

## Prior Session — 2026-10-29 (model groups and subscriptions)

Operator request: author FIDs that give complete control of model groups and a
real customer subscription service, including what each plan includes and what
it costs. This is a records-only pass; no application code changed.

- [x] **G1 — Group FID authored.** `dev/fids/FID-2026-1029-007-model-group-control.md`
  is converged with a schema, API, UI, migration, test, and verification plan.
- [x] **G2 — Group scope recorded.** The FID is registered here; implementation
  has not started and no source file changed.
- [x] **G3 — Subscription FID authored.**
  `dev/fids/archive/FID-2026-1029-008-subscription-plans-and-entitlements.md`
  is converged with plans, entitlement snapshots, recurring Stripe billing,
  allowance metering, admin and customer surfaces, tests, and gates; it was
  implemented and closed later the same day (S15–S23).
- [x] **G4 — Dependency recorded.** FID-008 builds on FID-007's
  `model_groups` and `models.group_slug`; both were design-only at authoring
  time and are now implemented and closed (S10–S23).

## Prior Session — 2026-10-29 (governance reconciliation)

Operator request: reconcile FID-2026-1029-001, FID-2026-1029-006, and SCOPE
with the current repository. This is a records-only pass; no application code
changed.

- [x] **R1 — FID-001 closure.** Closed against
  `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first commit containing the
  rebuilt tree; archived.
- [x] **R2 — FID-006 metadata.** Corrected the archived status from `converged`
  to `closed`.
- [x] **R3 — Scope truth.** Marked the original read-only review complete;
  registered B1 (real Stripe test receipt) and B2 (route-level HTTP coverage).
- [x] **R4 — Verification.** `npm run verify` exit 0: 48/48 tests, quality PASS
  over 125 files, 33-route build.

## Prior Session — 2026-10-29 (FID-2026-1029-006)

Operator request: customer signup, account ownership, and a real credit
top-up flow so paid models can be sold to outside users, built as production
software even though development runs locally.

- [x] **P1 — Identity.** Email/password signup, scrypt hashing, duplicate-email
  `409`, generic login failure, and per-client limits.
- [x] **P2 — Sessions.** Opaque server-side tokens in `sg_session`; hashed at
  rest, HttpOnly, SameSite=Lax, seven days, Secure in production; logout
  revokes the row.
- [x] **P3 — Ownership.** Account-scoped key CRUD, usage, ledger, and top-up
  history; same-origin mutations; cross-account revoke denied.
- [x] **P4 — Surfaces.** `/signup`, `/login`, `/account`, admin Customers page,
  and customer-oriented landing copy.
- [x] **P5 — Payments.** Stripe Checkout for $5–$500, signature-verified
  webhook, amount/currency match, unique provider ref, one-transaction
  fulfillment, success redirect grants nothing.
- [x] **P6 — Receipt.** Unit tests, full gates, disposable-DB HTTP and a locally
  signed webhook fulfillment receipt, FID closure, changelog, commit, push. This
  is not a real Stripe Checkout or card payment; that path is B1.

Findings:

- **F9 — a success redirect is not payment evidence (high if mishandled).**
  Checkout returns through the browser, but `fulfillTopup` runs only in the
  webhook path and only after signature, `payment_status=paid`, amount, and
  currency checks. Replay is a no-op.
- **F10 — checkout without a webhook secret would take money with no credit
  path (medium).** `readStripeConfig` requires both `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`; otherwise checkout returns `503`.
- **F11 — Node's test resolver cannot load extensionless internal imports
  (low).** `lib/password.ts` now owns its password-length bound instead of
  importing the customer module, keeping the scrypt helper directly testable.
- **F12 — the operator loopback bypass was spoofable (high for a public
  deployment).** A remote client could send `Host: localhost` to reach
  `/api/keys`, `/api/usage`, `/api/models`, and `/api/provider/sync`. A
  production build now disables the loopback branch and redirects `/dashboard`
  to `/admin/login`; development keeps the convenience. This was a pre-existing
  boundary, tightened because the service now sells to outside customers.

## Prior Session — 2026-10-29 (FID-2026-1029-005)

Operator correction: the catalog was reporting `provider: "Free"`. Savant
Gateway is the provider; `free` is the price group, and the family is the
model line.

- [x] **P1 — Vocabulary.** Provider = Savant Gateway; family = GPT/Claude/…;
  group = free/paid/subscription.
- [x] **P2 — Data boundary.** Normalize `"Free"` out of the family during
  sync; repair legacy rows on boot.
- [x] **P3 — API.** `/v1/models` publishes `owned_by: "savant-gateway"`,
  `family`, and `group`; `/api/models` publishes the provider identity and
  `family`.
- [x] **P4 — UI.** Public catalog, landing preview, admin catalog, pricing,
  and analytics use Family and Group; `/models` states the provider identity.
- [x] **P5 — Verification.** Unit tests, gates, live sync, and API/UI receipts.

Findings:

- **F7 — the upstream group sentinel was stored as a provider (medium).** 21
  rows had `provider='Free'`; `/v1/models` reported `owned_by: "Free"`. Fixed
  at sync, boot migration, API, and UI. No routing or money math changed.
- **F8 — the serializable field was named `provider` (low).** Renamed to
  `family` on model and analytics shapes; the internal DB column stays for
  compatibility.

## Prior Session — 2026-10-29 (FID-2026-1029-004)

Operator request: ship a full provider catalog rather than a free-only pool,
add a pricing/math surface for adjusting sell prices and seeing profit and
margins, add analytics, use all models in tables, add Font Awesome Free, and
build it as production software even though it runs on localhost.

- [x] **P1 — Schema.** Additive sell-price, price-source, catalog-presence,
  credit, hold, ledger, charged-revenue, and settings storage.
- [x] **P2 — Math.** Pure micro-dollar pricing, markup, margin, blended profit,
  token cost, hold, estimate, and validation helpers with unit tests.
- [x] **P3 — Catalog.** Additive sync that preserves manual prices, disables,
  and delisted rows; public and admin model shapes.
- [x] **P4 — Credits.** Atomic reservation, expiry sweep, actual-usage
  settlement, ledger, and operator grants.
- [x] **P5 — Routing.** Every active model routable once priced; unpriced
  non-free rows rejected; paid holds settled on JSON, stream, cancel, and
  error.
- [x] **P6 — Public surface.** `/models` table with search, sort, access
  filters, and pagination; landing copy and preview updated.
- [x] **P7 — Admin surface.** Authenticated shell with overview, catalog,
  pricing, and analytics; inline price edits and bulk markup.
- [x] **P8 — Icons.** Font Awesome Free installed and applied across public,
  console, and admin shells.
- [x] **P9 — Verification and records.** Gates, production-server smoke,
  disposable-DB money receipt, FID closure, changelog, commit, push.

Findings during implementation, all completed in the same pass:

- **F4 — the hold capped the charge (high).** A paid call reserved 15 micros
  but the provider reported 33 micros of usage; the first settlement charged
  15, silently underbilling. Settlement now debits the actual charge and lets
  an overrun leave a negative balance that blocks the next paid call with
  `402`. The UI copy that described the cap was corrected.
- **F5 — analytics copy claimed a cap after the fix (low).** The analytics
  footnote still said revenue was “capped by the reservation.” Corrected to
  describe the hold as admission control and actual usage as the charge.
- **F6 — `data/` was only partially ignored (medium).** The admin cookie jar
  and verification JSON were untracked but not ignored. `/data/` is now
  ignored as a whole; no runtime state can enter a commit.

## Prior Session — 2026-10-29 (FID-2026-1029-003, automation level 3)

Operator request: build a proper landing page and a working admin panel, use the
supplied logo/favicon assets, and replace the condensed ECHO summary with the
canonical protocol files from `savant-code`, configured for this repository.
The `savant-code` checkout is read-only for this work.

- [x] **P1 — Protocol port.** Copy `ECHO.md`, `ECHO-single-agent.md`,
  `dev/echo-v0.1.2-single-agent.md`, `templates/`, `coding-standards/`, and
  `docs/echo-protocol.md`; configure `protocol.config.yaml`, `AGENTS.md`, and
  the docs for npm/Next.js and single-agent governance.
- [x] **P2 — Brand assets.** Commit `assets/` and publish logo and favicon
  copies under `public/`; wire metadata and the web manifest.
- [x] **P3 — Landing page.** Public `/` with live catalog counts, free-model
  showcase, workflow, feature and code sections, and links to the console.
- [x] **P4 — Console route.** Move the existing dashboard to `/dashboard` with
  its own shell so `/` can be public marketing.
- [x] **P5 — Admin authentication.** Password login with an HMAC-signed,
  HttpOnly session cookie, rate limiting, and explicit unconfigured state.
- [x] **P6 — Admin panel.** `/admin` with provider sync, model enable/disable,
  consumer-key management, and usage visibility.
- [x] **P7 — Verification.** Unit tests for session signing and password checks;
  local gates; live HTTP checks of landing, login, model toggle, and logout.

Evidence is recorded in
`dev/fids/archive/FID-2026-1029-003-landing-admin-and-protocol-port.md` (closed
against `508d443`).

Findings during implementation, all completed in the same pass:

- **F1 — logout did not revoke a token (medium).** Clearing the cookie left the
  signed token valid until expiry; the first live receipt returned `200` for
  `/admin` with the old cookie. Fixed with a durable session epoch that logout
  bumps; the old token now returns `307` to `/admin/login`.
- **F2 — model ids are path-unsafe (low).** `free/*` ids contain `/`, so the
  planned `PATCH /api/admin/models/[id]` was replaced by a collection PATCH
  carrying `{ id, status }`.
- **F3 — a sync would re-enable disabled models (medium, found in plan audit).**
  `replaceModels` now captures disabled ids before deleting and re-inserts them
  as disabled; verified live across a provider sync.

## Approved Work Items

- [x] **Review the gateway project** (interpreted scope, presented 2026-10-28;
  completed 2026-10-29):
  - Ground with ECHO protocol — activation confirmed, canonical laws read 0-EOF.
  - Map architecture: `src/`, `server/`, `shared/`, `public/`, `tests/`.
  - Read every production file 0-EOF (Law 1) before any assessment.
  - Run the project's declared gates (scripts in `package.json`; no `protocol.config.yaml` present) and paste tool output as evidence (Law 3).
  - Assess the codebase against Laws 5-15 and the Five Questions.
  - Deliver the review report to the operator.
  - Completed: D1–D50 are recorded below; the 2026-10-29 operator ruling lifted
    the read-only constraint and authorized the rebuild.

## Discoveries (added as found)

Recorded read-only under the approved review item; any fix remains blocked pending an explicit operator ruling (review is read-only by this SCOPE's own constraint).

- **D1 — Lint gate is not clean (Law 15).** `npm run lint` exits 0 but emits 77 warnings, verified 2026-10-28 with `Select-String ': warning '` (unused imports/vars in `server/routes.ts`, `server/gateway.ts`, `server/db.ts`, `server/promo.ts`, `server/subscriptionPayments.ts`, plus react-hooks warnings in `src/`). Evidence: lint output in session log.
- **D2 — Upstream provider secrets stored plaintext at rest.** `provider_keys.secret TEXT NOT NULL UNIQUE` (`server/db.ts:187-197`) holds the `sk-apx-...` upstream key verbatim; no application-level encryption. Evidence: `server/db.ts`, `server/providerKeys.ts`. Severity: medium.
- **D3 — `.env.local` is not loaded by the API server.** `server/index.ts:1` uses `import 'dotenv/config'`, which loads `.env` only; `.env.local` (present in the workspace) is read by Vite for `VITE_*` client vars only. Server-side settings placed there are silently ignored. Evidence: `server/index.ts:1`, `vite.config.ts:16`. Operator action: use `.env` for server vars.
- **D4 — Test suite passes but logs SQLITE_ERROR noise.** `npm test`: 218 tests, 216 pass, 0 fail, 2 skipped, exit 0. Referral flows log `no such table: subscription_payments|wallet_purchases|rpm_payments` because those tables are created lazily by feature modules rather than in `server/db.ts`; test files that import only some modules lack them. Evidence: test output. Signals fragmented schema ownership (Laws 11/13) and production-path log noise. Severity: low-medium.
- **D5 — Swallowed errors in `server/db.ts` (Law 14).** `db.ts:788-798` catches and discards the upstream-provider normalization error; `db.ts:852-853` is an empty `try {} catch {}` block. Evidence: file read. Severity: low.
- **D6 — 5xx responses echo `err.message` to clients.** `server/index.ts:124-128` returns internal error text on 500s instead of a generic message. Evidence: `server/index.ts`. Severity: low.
- **D7 — Lenient JSON body parser diverges from strict JSON.** `server/index.ts:69-85` retries `JSON.parse` after rewriting raw control characters, accepting bodies that other OpenAI-compatible gateways reject. Evidence: `server/index.ts`. Severity: informational.
- **D8 — No VCS metadata in this working copy.** Directory is not a git repository (environment probe); version-control laws (G1-G9) cannot be satisfied locally and commits cannot be produced as evidence. Evidence: environment check. Severity: process.
- **D9 — Provider failure classification by substring matching.** `markProviderSecretFailed` (`server/providerKeys.ts:578-618`) classifies auth/balance failures via lowercase substring checks; brittle against upstream message changes. Evidence: file read. Severity: low.
- **D10 — Non-expiring customer sessions.** `USER_SESSION_EXPIRES_AT = '9999-12-31T23:59:59.000Z'` (`server/auth.ts:9`) keeps customer sessions alive until logout; sessions are also accepted via `Authorization`/`X-Session-Id` headers (`server/auth.ts:120-142`). Password hashing is scrypt + `timingSafeEqual` (good). Evidence: `server/auth.ts`. Severity: medium (design decision to present).
- **D11 — Client bundle exceeds Vite 500 kB warning threshold.** Build emits 733.73 kB JS (206.13 kB gzip). Evidence: build output. Severity: low (performance).
- **D12 — Plaintext customer API key secrets are stored and re-exposed (extends D2).** `api_keys.secret` is written verbatim (`server/routes.ts:1291-1293`, `server/playgroundAuth.ts:40-42`), returned by `GET /api/user/keys` (`server/routes.ts:1245,1261`) and by `GET /api/admin/api-keys` via `SELECT k.*` (`server/routes.ts:3452-3456`). Authentication itself uses `secret_hash`, so plaintext exists only for redisplay. A DB read or admin-session compromise yields every customer key. Severity: high.
- **D13 — Development admin token gated by a substring check.** `devAdminAccessTokenUser` (`server/routes.ts:232-242`) accepts `X-Admin-Access-Token` whenever `SITE_URL` contains `dev.` and `DEV_ADMIN_ACCESS_TOKEN` matches, returning a synthetic `owner` identity consumed by `requireAuth` (`server/routes.ts:274`). Any URL containing `dev.` (e.g. a staging host) enables a static admin token. Severity: medium.
- **D14 — Admin balance adjustment can drive a wallet negative.** Negative amounts are explicitly allowed (`server/routes.ts:3405-3411`) and applied with no floor (`server/routes.ts:3427`), so `users.balance_tokens` can become negative. Severity: low.
- **D15 — Admin API-key status update accepts an arbitrary string.** `PATCH /api/admin/api-keys/:id` writes `request.body.status` with no allowlist or validation (`server/routes.ts:3459-3466`), allowing states outside `active|revoked`. Severity: low.
- **D16 — Law 6 violation: `any`-typed route handlers.** Five handlers use `(request: any, reply: any)` (`server/routes.ts:1629,1710,1726,1735,1740`), bypassing Fastify's request/response types. Severity: low.
- **D17 — Dispatch-slot accounting bug inflates concurrency.** On queue timeout, `server/gateway.ts:1949-1951` calls `releaseDispatchSlot()`, but the timeout path in `server/dispatchQueue.ts:63-68` never acquired a slot. Every timeout decrements `activeSlots` below the real in-flight count, allowing concurrency above `MAX_CONCURRENT = 40`. Severity: medium.
- **D18 — Client disconnect refunds the entire stream hold.** `server/gateway.ts:3360-3370` records the stream as an error with zero tokens; `recordUsage` then calls `releaseReservation` (`server/gateway.ts:481-489`), and `server/tokenReservations.ts:340-376` refunds the full hold. A client can receive most of a streamed completion, disconnect, and pay nothing while the upstream cost is incurred. Severity: medium (revenue leak / abuse vector).
- **D19 — Dead code and unfinished alerting in the gateway.** Unused `walked` slice at `server/gateway.ts:2109-2111`; empty `if (!clientGone) { }` where an operator alert belongs at `server/gateway.ts:3368-3369`; unused `_options` parameter in `buildUpstreamPayload` (`server/gateway.ts:1464-1468`). Severity: low (Laws 5/15).
- **D20 — Admin subscription statistics return placeholders.** `getAdminSubscriptionStats` returns `byPlan: []` and `freeTierToday: {users: 0, tokensUsed: 0}` despite the data being queryable (`server/subscriptions.ts:787-806`). Severity: low-medium (misleading ops data; Law 5).
- **D21 — Documentation drift on pack depletion.** `getActiveExtraTokenPack` is documented as marking a pack depleted when remaining tokens drop below 1,000,000 (`server/subscriptions.ts:287-297`), but no such logic exists. Severity: low (Law 9).
- **D22 — Two RPM sources of truth.** `gatewayFairness` exposes legacy `rpmFree`/`rpmSubscription` (`server/gatewayFairness.ts:15-27`) while enforcement reads the account RPM plan (`server/gateway.ts:1685-1697`); the fairness values are now aliases, an easy configuration trap. Severity: low.
- **D23 — Rate limits and fairness state are per-process only.** Buckets live in a process-local map (`server/rateLimit.ts:8`) and the dispatch queue is module state (`server/dispatchQueue.ts:29-32`). Any multi-process deployment multiplies effective limits and splits queue state. Severity: operational.
- **D24 — Any positive admin adjustment counts as a top-up.** `hasUserTopup` treats `balance_transactions.type = 'adjustment'` with a positive amount as a qualifying top-up (`server/restrictedCredits.ts:154-157`), so a manual credit unlocks Anthropic models and bypasses the top-up gate. Severity: low (design semantics).
- **D25 — Terminal gateway errors bypass sanitization.** The final loop-exhaustion response returns raw `${lastError} (after N attempts)` (`server/gateway.ts:2291-2294`), while every other upstream failure path uses `clientSafeUpstreamError` (`server/gateway.ts:2105,3025`), which deliberately genericizes non-400 failures (`server/modelOutputLimits.ts:69-86`). Severity: low-medium (upstream internals can leak to clients).
- **D26 — `upgradeUserRpm` has no production caller and no replay guard.** Repo-wide grep finds the function only in `server/rpmPlans.ts:301`, tests, and compiled `dist-server`; nothing in the live route graph calls it (Law 4 dead code). It also lacks a `credited_at` guard: a repeated call with the same `orderId` extends `rpm_expires_at` again before the `ON CONFLICT` update (`server/rpmPlans.ts:323-359`). Latent revenue bug if it is ever re-wired. Severity: low today.
- **D27 — Empty catch and hardcoded prices in the RPM module.** `server/rpmPlans.ts:382-383` is an empty `try {} catch {}` (Laws 5/14). `upgradeUserRpm` falls back to hardcoded prices 1080/2120 cents (`server/rpmPlans.ts:320`) that duplicate the admin-editable RPM catalog (`saveRpmCatalog`), breaking single-source-of-truth (Law 13). Severity: low.

- **D28 — Five complete admin pages and three public components are orphaned (Law 4/5/7/13).** `src/App.tsx` does not import or route `AdminApiKeys`, `AdminAuditLogs`, `AdminEvent`, `AdminLevels`, or `AdminPricing`; `AdminLayout.tsx` has no nav entries for them. `src/pages/PublicDocs.tsx`, `src/components/CheckoutPayMethods.tsx`, and all exports of `src/components/PublicPricingBlocks.tsx` (`PlanGrid`, `PriceCompare`, `PricingCtas`) have no importers. Repo-wide `rg` finds only their own definitions. The corresponding server endpoints remain live, so API keys, audit logs, promo events, level settings, and pricing cannot be reached from the console; the orphaned API Keys page also claims full secrets are never shown, contrary to D12. Severity: medium.
- **D29 — Notification, health, and revenue-reporting subsystems are non-functional stubs (Law 4/5/9/14).** Six independent features are wired to code that cannot perform its advertised job:
  - `server/modelStatusPoller.ts:3-25` is entirely empty (`setModelHealthOverride`, `refreshAllModelStatuses`, `refreshModelStatuses`, `rematchCachedStatuses`, `getModelStatusMap`, `getModelStatusMeta`, `startModelStatusPoller`). Call sites at `server/routes.ts:444-453`, `2280-2285`, `2338-2343`, and `2354-2361` therefore always return `no_data`; the health override is audited but silently discarded (admin response falls back to `auto`).
  - `server/userBalanceAlerts.ts:1-9` is entirely empty. `server/routes.ts:994-1010` exposes low-balance settings that can never be enabled, and `server/gateway.ts:485,499` calls the no-op after every settlement.
  - `server/opsMonitor.ts:22-24,28-30,34-36,43` contains empty `if` bodies where operator alerts belong; the monitor runs every 60s and can never alert on health failures, latency, or an empty provider pool.
  - `server/revenueReports.ts:135-178` builds `lines` and `totals`, then only calls `setSetting(reportKey, ...)`; no transport is invoked. `startRevenueReportJob` (`:310-319`) calls this function, so daily/night reports are marked sent and never delivered. `generateAndSendRevenueReport` (`:180+`) has the same missing transport and no production caller.
  - `server/subscriptions.ts:397-410` starts a job whose only action is `expireDueSubscriptions()`; `runSubscriptionExpiryNotifications` (`:640`) has no production caller. Subscription expiry reminders therefore never run despite the job name and tests.
  - `server/adminLoginApproval.ts:44-49` immediately creates a session and returns `pending: false`; the Telegram approval table is never populated. `src/admin/AdminAuth.tsx` still renders and polls a “Waiting for Telegram approval…” flow that cannot occur.
  Severity: high (silent loss of operational alerts, revenue reports, expiry notices, and model-health controls).
- **D30 — Model usage analytics classify priced models as free and report zero cost (Law 5/9/12).** `server/modelUsageStats.ts:174` treats any catalog row with `token_weight === 0` as `free`. Paid catalog defaults all use `token_weight: 0` (`server/providerKeys.ts:640-664`), and the schema migration explicitly sets weight 0 for priced models (`server/db.ts:965-977`). `costUsd` is then forced to 0 for `kind === 'free'` (`server/modelUsageStats.ts:215`), and the daily series uses the same classifier (`:288-290`). Admin totals therefore under-report paid requests and revenue; the comment at `:50-54` documents the opposite intent. Severity: high (misleading ops/finance data).
- **D31 — Public uptime/status reports operational when there is no data (Law 5/9).** `classifyHour` returns `'up'` for `total <= 0` (`server/modelUptime.ts:13-18`), and `buildModelUptime` passes `total: 0` for every empty hour (`:84-110`). The `latest` loop skips only `'none'`, so a model that never served traffic is reported `operational` with 100% uptime; a single failed sample also becomes `'none'` and can be skipped. `src/pages/Status.tsx:30-35` reinforces this by mapping the `none` hour state to the label `operational`. Severity: medium-high (status page is green by default).
- **D32 — Kimi installer emits literal `${SLUG()}` model aliases and a stale model id (Law 4/9/11).** `server/installScripts.ts:876-891` defines `KIMI_MODELS` with single-quoted aliases such as `'${SLUG()}/free/kimi-k3'`. The generated TOML writes those placeholders literally under `[models."..."]`, while `default_model` is interpolated to the real slug, so the default model has no matching table entry. The same block references `gpt-6-sol`, which is absent from `APINEX_CATALOG_DEFAULTS` (the current id is `gpt-6.1-sol`); `src/developers/pages.tsx:1508,1539-1541` repeats the stale id. No test covers installer output. Severity: medium.
- **D33 — Luna output-limit guard matches retired model ids (Law 4/5/11).** `server/modelOutputLimits.ts:11-15` recognizes only `gpt/5.6-luna` and ids ending `/gpt-5.6-luna`. The current catalog uses `gpt-6-luna`, `free/gpt-6-luna`, and `gpt-6-luna-decisions` (`server/providerKeys.ts:653,664,672`). The 128K native output cap and 900K input cap therefore never apply to the shipped models. `tests/modelOutputLimits.test.ts` uses the retired ids, so the gate stays green without covering production ids. Severity: medium.
- **D34 — Reservation lifecycle leaks holds and lets long streams escape billing (Law 3/14).** `server/gateway.ts:1926-1955` reserves tokens, then returns on `dispatch.timedOut` without calling `releaseReservation`; the hold remains until the 15-minute sweep (`server/tokenReservations.ts:383-425`). That sweep refunds the full hold even if the stream is still open; the later `settleReservation` (`server/gateway.ts:483`) returns `{ok:false}` for an expired row and the result is ignored, so a stream longer than 15 minutes is free and the key's `spent_tokens` is not advanced. Overage debits inside `settleReservation` (`server/tokenReservations.ts:313-316`) also ignore `debitApiTokens`/`debitRegularTokens` failures, silently losing the excess. This is distinct from D17 (slot accounting) and D18 (client-disconnect refunds). Severity: high (revenue leak and locked customer funds).
- **D35 — Account-level free-model weight is never applied (Law 4/13).** `server/accountLevels.ts:95-97` exports `freeModelWeightForUser`, but a repo-wide search finds only its definition. `server/gateway.ts:504-506` implements `freeAllowanceWeight(_userId, _model)` as `return 1`. The configured level multipliers (default 3x at level 1 down to 1x at level 5) therefore never affect free-tier consumption; level-1 users consume the same 1x as level-5 users. Severity: medium.
- **D36 — Admin allowance data reports unlimited plans as FREE and every subscription as custom (Law 5/9).** `server/subscriptions.ts:809-867` does not select `user_subscriptions.kind`, hardcodes `kind: 'custom'` and `planKey: 'custom'` for every active subscription, and only enters the subscription branch when `token_limit > 0`. Unlimited plans (`token_limit` 0/null) fall into the FREE branch and are shown with the daily free-tier limit. Severity: medium (admin misrepresents paid entitlements).
- **D37 — Revenue totals omit RPM, wallet, and NFT purchases (Law 9/11/13).** `server/revenueReports.ts:62-110` reads only `crypto_payments` and `subscription_payments`; `getDonationsRevenueUsd` (`:231-270`) has the same two-table scope (the `nft_payments` comment at `:249` has no branch). `server/adminStatistics.ts:541` does include `rpm_payments`, so the admin dashboard and the revenue report disagree. `wallet_purchases` is also omitted. Severity: medium (revenue undercount).
- **D38 — Production start uses the dev runner, ignores `dist-server`, and has no documented frontend serving (Law 3/9).** `package.json` defines `start: "tsx server/index.ts"`; `tsx` is a devDependency and the build's `dist-server/` output is never executed. A production install with `npm ci --omit=dev` cannot run `npm start`. README “Production Build & Verification” says `npm run build` then `npm start`, but Fastify serves no `dist/` assets and no reverse-proxy/static-host step is documented. Severity: medium (deployment break).
- **D39 — Admin password rotation does not revoke existing admin sessions (Law 12).** `server/seed.ts:13-21` updates the existing admin's `password_hash` on every boot but does not delete rows from `sessions`. An attacker holding a pre-rotation admin cookie keeps access for the 7-day session TTL in `server/auth.ts`. Severity: medium.
- **D40 — Voucher redemption ignores account suspension (Law 12).** `server/routes.ts:1192` authenticates `/api/vouchers/redeem` with `resolveCustomerOrApiKeyUser` (`:256-270`), which checks only that the API key exists and is active. Unlike `authenticateApiKey` (`server/gateway.ts:255`) and `getCustomerSessionUser` (`server/auth.ts:190-193`), it never checks `users.status`. A suspended user with an active key can redeem vouchers. Severity: low-medium.
- **D41 — Admin statistics worker can hang forever (Law 14).** `server/adminStatisticsJob.ts:34-58` settles only on a worker message, an error, or a non-zero exit. If the worker exits 0 without posting a message, the promise never settles and `inflight` is never cleared; there is no timeout. Every `/api/admin/statistics` or `/models` request after that shares the hung promise. Severity: medium.
- **D42 — Activity logs persist customer email and wallet and upload them off-host (Law 12).** `server/userActivityLog.ts:127-149` resolves `email` and `solana_wallet` for every logged request; `:167-199` writes them to `current.ndjson`; `rotateActivityLogs` tars and uploads the file via rclone. This is deliberate audit logging, but it places direct PII in a plaintext rotating log outside the database. Severity: medium (privacy/compliance).
- **D43 — “Median” latency is computed as an average (Law 5/9).** `server/modelUsageStats.ts:90-110` labels `ROUND(AVG(latency_ms)) AS median_latency_ms`; the 20,000-row cap also samples only the newest rows before grouping, so the per-model figure is neither a median nor a complete-window statistic. Severity: low.
- **D44 — Malformed catalog tags can 500 an admin update (Law 14).** `server/routes.ts:2570` calls `JSON.parse(String(current.tags_json ?? '[]'))` without a guard; a legacy/corrupt `tags_json` throws out of the handler. Severity: low.
- **D45 — Dev admin token client/server host gates disagree; duplicate code remains (Law 7/11).** `src/admin/api.ts:18-22` sends `X-Admin-Access-Token` only on hosts starting `dev-admin.`, while `server/routes.ts:233-242` accepts it only when `SITE_URL` contains `dev.`; `src/admin/AdminAuth.tsx:31-40` repeats the client-side gate. A `https://dev-admin.example.com` deployment therefore never sends/accepts the token together. Also `server/auth.ts:121-122` repeats the same `x-session-id` lookup, `server/auth.ts:13` repeats the same `SITE_URL` lookup, and `server/index.ts:184` lists `X-Session-Id` twice in CORS. Severity: low.
- **D46 — Additional Law 6 type-safety shortcuts.** Beyond D16: `src/admin/api.ts:59` returns `request<any>`, `src/admin/pages/AdminStatistics.tsx:18,62,64,548,567` uses `any`/`as any`, `server/modelUsageStats.ts:354` stores `data: any`, and `server/promo.ts:176` uses `as unknown as PromoCodeRow`. Severity: low.
- **D47 — Workspace hygiene artifacts.** Root `database.db` is a 4 KB empty SQLite file not covered by `.gitignore` (which ignores `data/*.sqlite` only). Root `firebase-debug.log` is ignored by `*.log` but still present and contains the signed-in Google account email. D8 already records that this working copy has no VCS metadata. Severity: low/process.
- **D48 — Config/docs drift.** `.env.example` uses a `[TEMPLATE]` section header and omits runtime settings used by code (`DEV_ADMIN_ACCESS_TOKEN`, `ADMIN_ALLOWED_HOSTS`, `PROXY_FILE`, `ACTIVITY_*`, `REVENUE_REPORTS_ENABLED`); README omits the production static-host/reverse-proxy requirement (see D38); `src/pages/Landing.tsx:31` and `src/developers/pages.tsx` still advertise `gpt-6-sol` while `src/pages/Docs.tsx` and the catalog use `gpt-6.1-sol`. Severity: low.
- **D49 — Provider `allowFree` capability is ignored, so subscription-only models are advertised as free (Law 5/9/11).** The public metadata at `https://apinex.bond/api/public/models` includes `allowFree` per model; the gateway’s metadata type and import path (`server/providerKeys.ts:695-760,825-850`) never read it. `importApinexCatalogModels` treats every `free/*` id as free (`server/providerKeys.ts:892+`), and `/api/public/models` exposes them as free. Live check: provider `free/claude-opus-4.6` returns HTTP 402 `This model is currently available only with a subscription` even though its id starts `free/`. Severity: medium-high (advertised models fail for free-plan users).
- **D50 — Gateway free-tier metering ignores the provider’s weighted free pool (Law 5/9/11/13).** Provider public metadata gives `free/gpt-6-luna` `weight: 3`; a live direct call with `usage.total_tokens: 316` advanced provider `/v1/subscription.tokens_used` by **948** (3x). The provider free plan reports `token_limit: 20,000,000` weighted and `tokens_used` is shared by every request using that provider key. The gateway’s own `DEFAULT_FREE_DAILY_TOKENS` is 10,000,000 **raw** tokens per user (`shared/subscriptions.ts:80`) and `freeAllowanceWeight` returns 1 (`server/gateway.ts:504-506`), so its accounting is neither weighted nor tied to provider remaining. With one shared provider key, a few free users can exhaust the upstream pool while the gateway still believes each has allowance left. Severity: high for any multi-user resale of free models.

## Law Compliance Snapshot

- **Law 3 / 15:** `npm run ci` exits 0 but emits 77 warnings; 2 tests are skipped (`fairness.e2e`), and Vite still reports the >500 kB bundle warning. A clean gate is not achieved.
- **Law 4:** D28 (orphaned pages/components), D29 (stubbed subsystems), D35 (`freeModelWeightForUser` has no caller), D26 (unused `upgradeUserRpm`), D19 (unused gateway code).
- **Law 5:** D29, D30, D31, D43, D49, D50; empty functions and placeholder returns are pervasive.
- **Law 6:** D16 and D46.
- **Law 7 / 13:** D28, D32, D37, D45; duplicate revenue-report builders, duplicate auth lookups, duplicate CORS header, dead pricing components.
- **Law 9:** D28, D29, D31, D32, D36, D37, D38, D48, D49, D50.
- **Law 12:** D2, D12, D42, plus D6 (internal error text) and D39/D40.
- **Law 14:** D5, D29, D34, D41, D44; ignored overage debits and worker errors are the highest-risk cases.
- **Law 1 / 2:** No application code was edited in this read-only review. Findings are recorded here; fixes require the operator ruling that lifts the review's read-only constraint.

## Blocked Items

- **B1 — Real Stripe test Checkout and paid completion receipt.** Blocked on
  missing Stripe **test** credentials (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`) and a controlled paid upstream balance. The
  fulfillment path was exercised on a disposable database with a locally signed
  event; a real Checkout session, Stripe-delivered webhook, and paid model call
  are not verified. Re-attempt immediately when test keys and a funded or mock
  upstream are available. Evidence:
  `dev/session-summaries/2026-10-29-customer-e2e-verification.md` (H1, H4).
- **B2 — Route-level HTTP verification.** Resolved 2026-10-29:
  `npm run test:http` boots the production build against a disposable database
  and covers signup cookies, logout/login, cross-account key ownership, signed
  webhook credit/replay/invalid/mismatch, exact paid settlement, unfunded
  rejection, and admin session behavior with 100 checks. FID-012 is closed and
  archived against `4374c00`; the gate runs after build in `verify`, CI, and the
  pre-push hook.
- **B3 — FID-2026-1029-007 implementation.** Resolved 2026-10-29:
  implemented and verified in S10–S13, committed as `161ddcc`, and closed and
  archived as FID-007. The group schema, routes, tests, and admin surface exist.
- **B4 — Real Stripe subscription receipt.** Partially resolved 2026-10-29:
  FID-008 is implemented, verified, committed as `a945789`, and closed and
  archived. Local signed-webhook coverage proved activation, replay, failure,
  and top-up dispatch. A real recurring Checkout and a Stripe-delivered
  invoice remain unverified for the missing Stripe test credentials in B1.
- **B5 — FID-2026-1029-010 implementation.** Resolved 2026-10-29: implemented
  and verified in S8/S9; committed as `957430c` and closed against `b5ae9fc`.
  Live CommandCode inference still needs `COMMANDCODE_API_KEY` in `.env.local`;
  no secret belongs in the tree.

## Operator Rulings

- 2026-10-29: **Sell the full catalog, not only free models.** Add sell-price
  controls, margin math, a credit ledger, analytics, full model tables, and
  Font Awesome Free. Build for production even though development is local.
- 2026-10-29: **Abandon the legacy Vite/Fastify product shell and rebuild on Next.js 16 + HeroUI v3.** Preserve only the verified provider/gateway core: provider client, model sync, consumer-key auth, free-model routing, streaming, and usage metering. The old tree was removed after the core was extracted into `lib/`. This ruling lifts the review's read-only constraint.
- 2026-10-29: **Complete model-group control.** Model groups are operator-owned,
  not derived labels. The operator can create custom groups, assign any model,
  move a model between free, paid, and subscription billing modes, delete a
  custom group only by reassigning its models, and keep manual assignments
  across provider sync. FID-2026-1029-007 is the implementation contract; no
  code changed in the authoring pass.
- 2026-10-29: **Real subscription service, not a catalog label.** Plans must
  carry a price, interval, included groups/models, weighted-token allowance,
  overage policy, entitlement snapshot, recurring Stripe lifecycle, and
  admin/customer controls. FID-2026-1029-008 is the contract; it depends on
  FID-007 for groups and grants nothing until implemented.
- 2026-10-29: **Close D6 and D50, and support two upstream protocols.** Error
  sanitization and free-pool admission control are implementation work, not
  design-only records. The gateway will support both OpenAI-compatible and
  Anthropic Messages upstreams from one backend, configured by the operator;
  CommandCode is the intended second provider. FID-2026-1029-009 covers the
  remediation; FID-2026-1029-010 is the provider-registry contract.
- 2026-10-30: **SQLite is a local-development placeholder.** A production
  database will be selected before launch regardless of host, so the database
  migration is planned work rather than a consequence of choosing Vercel. Host
  selection is judged on what it adds after that move: a persistent Node host
  needs no shared-limiter work, while Vercel adds per-invocation connections and
  a shared rate limiter. Requirements and the compatibility table are in
  `docs/launch-plan.md` Phase 3.

## Progress Log

- 2026-10-28: Gates executed. lint: exit 0, 77 warnings (recounted; supersedes the earlier 94). build: exit 0 (`tsc -b`, `tsc -p tsconfig.server.build.json`, `vite build`; chunk-size warning). test: exit 0, 218 tests / 216 pass / 2 skipped / 0 fail, referral `SQLITE_ERROR` noise.
- 2026-10-28: Read 0-EOF: `echo-v0.1.2-single-agent.md`, `SCOPE.md`, `.env.example`, `vite.config.ts`, `server/index.ts`, `server/db.ts`, `server/providerKeys.ts`, `server/auth.ts`, `server/securityHeaders.ts`, `server/providerProxy.ts`.
- 2026-10-28: Read 0-EOF: `server/routes.ts` (3,534), `server/gateway.ts` (3,376), `server/tokenReservations.ts`, `server/dispatchQueue.ts`, `server/rateLimit.ts`, `server/gatewayFairness.ts`, `server/restrictedCredits.ts`, `server/wallet.ts`, `server/playgroundAuth.ts`, `server/promoEvents.ts`, `server/subscriptions.ts`, `server/referrals.ts`, `server/modelOutputLimits.ts`.
- 2026-10-28: Read 0-EOF: `server/paymentSignatures.ts`, `server/paymentExpiry.ts`, `server/subscriptionPayments.ts`, `server/rpmPlans.ts`.
- 2026-10-28: Read in full in this pass: `server/modelStatusPoller.ts`, `server/userBalanceAlerts.ts`, `server/opsMonitor.ts`, `server/adminLoginApproval.ts`, `server/googleAuth.ts`, `server/accountLevels.ts`, `server/modelUptime.ts`, `server/modelUsageStats.ts`, `server/adminStatisticsJob.ts`, `server/revenueReports.ts`, `server/catalogImport.ts`, `server/seed.ts`, `server/installScripts.ts` (cited sections), `src/App.tsx`, `src/admin/AdminAuth.tsx`, `src/admin/AdminLayout.tsx`, `src/pages/Playground.tsx` (markdown renderer and stream parser), `src/pages/Status.tsx`, `src/auth/UserAuth.tsx`, `src/admin/api.ts` (cited sections).
- 2026-10-28: Client coverage was targeted rather than complete-line-by-line: orphaned pages/components were confirmed by repo-wide import/reference searches; the remaining UI pages were reviewed for route/API wiring and the cited rendering/auth paths. The review item's full-file UI pass is not claimed as complete.
- 2026-10-28: `npm run ci` re-run: exit 0; lint 77 warnings; build exit 0; 218 tests / 216 pass / 2 skipped / 0 fail. Findings D28-D48 appended above. No application code was changed.
- 2026-10-28: `.env.local` exists in workspace; contents deliberately not read (secrets). See D3.
- 2026-10-29: Read-only smoke boot with a throwaway DB (`PORT=8799`): `/api/health` returned 200; `ADMIN_PASSWORD` login and `/api/auth/me` succeeded; `/v1/chat/completions` without a key returned the expected OpenAI-shaped 401; `/api/public/models` returned an empty catalog; Google auth reported disabled because no OAuth credentials are configured. No upstream model call was attempted (no provider key available), so proxy/streaming/billing behavior remains unverified end-to-end. Server stopped after the test.
- 2026-10-29: Live inference verified against a throwaway DB (`PORT=8800`) using the operator-supplied provider key from `.env.local` without printing the secret. Provider key sync returned 200; model import added 49 models, 22 under `free/`. A disposable active user with a shimmed API key called `free/gpt-6-luna`: non-streaming returned HTTP 200 with content `gateway-ok`; streaming returned HTTP 200 `text/event-stream` with 12 `data:` events and `[DONE]`; `/v1/models` and `/v1/balance` returned 200. `usage_events` recorded both calls with `cost_tokens = 0`, the free-tier wallet stayed at 0, and both `token_reservations` settled at 0. No paid model was called, so paid billing/upstream spend remains unverified. Server stopped after the test.
- 2026-10-29: Direct provider probes against `https://api.apinex.bond/v1` with `Authorization: Bearer <key>` and `src: gate` (secret not printed): `/v1/balance` 200 (`balance_usd: 0`, `rpm: 15`, `rpm_plan: free`); `/v1/subscription` 200 (`mode: free`, `token_limit: 20,000,000` weighted, `tokens_used: ~820k`, `allowed: true`); `/v1/models` 200 with 45 ids, 21 under `free/`; direct `/v1/chat/completions` to `free/gpt-6-luna` 200 with `provider-ok`. Public metadata `https://apinex.bond/api/public/models` returns 45 models/21 free with `weight: 3` for `free/gpt-6-luna`; a 316-token call advanced `/v1/subscription.tokens_used` by 948 (3x). `free/claude-opus-4.6` has `allowFree: false` and returned 402 subscription-only. Added D49/D50.
- 2026-10-29: **Consumer-key path verified end to end** on a throwaway DB (`PORT=8801`, `data/proof-consumer.sqlite`, deleted after test; provider secret not printed): admin login 200; provider key added+synced 200 (`status=active`, `rpm=15`, subscription remaining ~19.18M); catalog import 200 (`imported: 49`); disposable customer session seeded; `POST /api/user/keys` 200 and returned a `sk-…` key; `POST /v1/chat/completions` with that key → `free/gpt-6-luna` 200 in 1.36s, answer `2 + 2 = 4.`, usage 427 in / 9 out / 436 total; `usage_events` recorded status `ok` (cost 0) and the key's `last_used_at` updated. Missing key → 401 `Missing API key`; fake key → 401 `Invalid API key`. Google OAuth remains unverified/unconfigured; only that login step was replaced by a seeded session.
- 2026-10-29: **Rebuild scaffolded on Next.js 16.4.3 + HeroUI v3.2.7.** Official HeroUI template generated, legacy Vite/Fastify tree removed, and the verified core reimplemented in `lib/provider.ts` (then named `lib/apinex.ts`), `lib/gateway.ts`, `lib/store.ts`, `lib/db.ts`, and `lib/api-keys.ts`. New dashboard uses HeroUI v3 components and Tailwind 4. SQLite is local (`data/gateway.db`) and ignored.
- 2026-10-29: **Gates:** `npm run lint` exit 0 with 0 warnings; `npm run typecheck` exit 0; `npm run build` exit 0 (Next 16 Turbopack, 9 routes, no build warning after scoping the DB path). Browser console: no errors.
- 2026-10-29: **Live verification of the rebuild:** `POST /api/provider/sync` → 200, 45 models imported, **11 free-pool models** (not 35); provider status `active`, balance `$0`, RPM 15, free pool remaining ~19.18M. `POST /api/keys` → 201; `GET /v1/models` with that key → 200, 45 models; `POST /v1/chat/completions` with `free/gpt-6-luna` → 200 in 1.5s, real answer; streaming → 200 `text/event-stream`, real answer. Missing key → 401; fake key → 401. Paid `gpt-6-luna` and `claude-fable-5.1` → 402 locally. UI-created key + browser tester → 200; usage rows recorded weighted tokens (990 and 948 for 330/316 raw tokens at weight 3).
- 2026-10-29: **D49 correction discovered during the rebuild:** APInex public metadata marks 35 models with `allowFree`, including paid models that return `402 Insufficient balance` on a zero-balance account. The new catalog therefore uses the `free/*` pool as the authoritative free signal; paid models are catalogued but blocked locally. Test keys and usage rows were deleted after verification; the synced catalog and provider status remain.
- 2026-10-29: **Repository published and governance gates wired.** The project is now a Git repository at `https://github.com/savant0x/savant-gateway` (public, `main`). This supersedes the FID-001 note that no Git repository or template gates exist: `quality`, `test`, `check` and `verify` now exist, along with `.githooks` and two CI workflows. FID-2026-1029-002 is closed against `bf3da9a` and archived under `dev/fids/archive/`. The provider adapter was renamed `lib/apinex.ts` → `lib/provider.ts` and residual reseller naming was stripped from source and UI; the vendor hostnames in `.env.example` remain because they are the upstream URLs. Local gates after the rename: `npm run check` 0, `npm test` 6/6, `npm run quality` PASS (40 files), `npm run build` 0. GitHub: `ci` and `attribution-guard` both green.
- 2026-10-29: **FID structure created** under `dev/fids/` with `archive/`, plus preserved audit baselines in `dev/fids/audit/`. `FID-2026-1029-001-nextjs-gateway-rebuild.md` records the operator ruling and
rebuild using the operator-supplied `templates/FID-TEMPLATE.md` structure. At
that time the status was `verified`, not `closed`, because the workspace had no
Git repository and the template's required local commit could not exist. Fresh gates: `npm run check` exit 0; `npm run build` exit 0; read-only database counts 45 models / 11 free / 0 keys / 0 usage. Documentary audit passes measured 3.101%, 2.168%, 0.610% and 0.435% (two consecutive passes below 2%, converged as a record only). Open findings recorded in the FID: spoofable Host-header local guard, usage-row copy overclaim, cancelled-stream under-recording. The template's  `fid:verify`, `quality:report`, `scope:check`, `validate:repository`,
  `progression` and `balance` gates do not exist here; actual gates were `lint`,
  `typecheck`, `check` and `build` at that time. **Superseded 2026-10-29:** the
  repository was published at `bf3da9a`; FID-001 is closed against that commit
  and archived, and the current gate set is `lint`, `typecheck`, `test`,
  `quality`, `build`, and `verify` with 48 tests.
- 2026-10-29: **Full-catalog product shipped (FID-2026-1029-004).** Final tree
  `2623912`: `npm run verify` exit 0 (lint 0 warnings, typecheck 0, 26/26 tests,
  quality PASS over 91 files, 20-route build). Production server on
  `localhost:3100`: `/models` 200 with sell prices only, admin pages 200 with a
  real session, unauthenticated `/admin` 307, foreign-origin PATCH 403,
  `/api/models` 45 rows with no cost keys, manual `gpt-6.1-sol` at cost `$0.30`
  / sell `$0.40` / 2500 bps. Provider sync imported 45 (11 free, 24 paid, 10
  subscription-only), preserved the manual price and a disabled model, and the
  model was re-enabled after the receipt. Money path on a disposable database:
  33-micro actual charge settled above a 15-micro hold, stream settled 322,000
  micros with zero holds left, unpriced 503, 70k budget 400, underfunded
  overrun negative and next call 402. Real paid upstream inference remains
  unverified because the provider account has no paid balance.
- 2026-10-29: **Provider/family/group correction (FID-2026-1029-005).**
  `npm run verify` exit 0 (30/30 tests, 92 files, 20 routes). Live: boot
  migration removed all 21 `provider='Free'` rows; sync again returned 45
  models and zero free sentinels; `/api/models` returned
  `provider: "Savant Gateway"`, `family: "DeepSeek"`, no legacy `provider`
  key; `/v1/models` returned `owned_by: "savant-gateway"`, `family:
  "DeepSeek"`, `group: "free"`; `/models` and the three admin tables render
  Family/Group with no Provider column.
- 2026-10-29: **Post-ship customer E2E verification handed off without a runtime
  receipt.** The production server was not running (`data/prod-server.pid` is
  stale; port 3100 refused), and `.env.local` has no Stripe test credentials,
  so Checkout and the webhook cannot be exercised. Static route mapping and a
  read-only database baseline (45 active models, 1 user, 2 keys, 0 top-ups)
  are recorded in
  `dev/session-summaries/2026-10-29-customer-e2e-verification.md`. No code or
  runtime data changed; the real Checkout and paid completion are registered as
  B1, not treated as complete.
- 2026-10-29: **D1–D50 audit report compiled.** Standalone report at
  `dev/audits/2026-10-29-d1-d50-audit-report.md`: 50 findings, 5 high, 2 open
  (D6 error-message exposure, D50 free-pool admission control), 1 accepted
  (D23 single-process rate limiters), 47 closed (22 fixed, 25 superseded).
  Current evidence: lint 0 warnings, 48/48 tests, quality PASS. No application
  code changed.
- 2026-10-29: **FID-2026-1029-007 authored.** The admin has no group write
  path: `accessFor` derives free/paid/subscription from provider flags, the
  catalog PATCH accepts only status, free rows are hard-zeroed, and a sync
  rewrites `allow_free`. The FID defines a `model_groups` table, manual/auto
  membership, group CRUD, assignment, group-aware pricing/routing, usage group
  snapshots, dynamic public filters, and additive `group_*` API fields while
  keeping `access` and `/v1/models` `group` stable. No code, migration, test,
  or runtime data changed; implementation is B3.
- 2026-10-29: **FID-2026-1029-008 authored.** “Subscription” currently means
  a `free/*` catalog bucket: `accessFor` derives it, `isFreeCall` sends it
  down the paid path, unpriced rows return 503, and the Stripe webhook handles
  one-time top-ups only. The FID defines plans, plan groups/models, entitlement
  snapshots, periods, holds, invoices, recurring Checkout, invoice-driven
  activation, overage block/credit, manual comps, and admin/customer pages.
  No code, migration, test, or runtime data changed; implementation is B4 and
  depends on FID-007 (B3).
- 2026-10-29: **Governance records reconciled.** FID-2026-1029-001 is closed
  against `bf3da9a` and archived; FID-2026-1029-006's archived metadata now says
  `closed`, matching its `Closed Date` and `Closed Against: 455ddb5`. The
  original read-only review is checked complete with D1–D50 as evidence. Real
  Stripe Checkout and route-level HTTP coverage are registered as B1/B2 rather
  than left outside the register. Fresh `npm run verify` exit 0: 48/48 tests,
  quality PASS over 125 files, 33-route build.
- 2026-10-29: **D6 and D50 implemented (FID-2026-1029-009).** D6: `sanitizeError`
  logs local exception detail server-side and returns fixed text on the public
  provider-fetch path, the admin credit grant, and provider sync. D50: free
  calls reserve weighted tokens before dispatch in one immediate SQLite
  transaction, enforce a per-user UTC-daily allowance and the effective provider
  remaining, and settle actual weighted usage with the usage row. New tables
  `free_pool_usage` and `free_pool_reservations`. New env limits documented in
  `.env.example`. Tests: `tests/free-pool.test.mjs` and two sanitizer cases in
  `tests/http.test.mjs`. Receipt: `npm run verify` exit 0, 62/62 tests, quality
  PASS over 127 files, 33-route build. Committed as `4782ce1`; FID-009 is closed
  against that commit and archived.
- 2026-10-29: **FID-2026-1029-010 authored.** The provider-registry contract
  covers a `providers` entity, per-provider credential variable names (values
  stay in `.env.local`), provider-scoped sync and model identity, OpenAI Chat
  Completions and Anthropic Messages adapters, manual cost mapping with a
  no-silent-zero-cost rule, provider-scoped free-pool admission, and admin
  provider controls. CommandCode is the intended second upstream; registration
  is B5 and no provider code changed.
- 2026-10-29: **FID-2026-1029-008 implemented and closed.** Plans, entitlement
  snapshots, allowance periods, holds, invoices, recurring Stripe lifecycle,
  gateway billing-source routing, customer and admin surfaces are committed as
  `a945789`. Receipt: `npm run verify` exit 0, 99/99 tests, quality PASS over
  186 files, 51-route build, plus the disposable HTTP receipt re-run after the
  replay guard was consolidated into one helper. Real Stripe Checkout and
  Stripe-delivered recurring invoices remain B4. The FID is closed and
  archived.
- 2026-10-30: **FID-2026-1030-040 implemented and closed.** Display-only: a UTC
  formatter shared by server and browser put every timestamp in UTC for every
  reader. `components/local-time.tsx` now renders the UTC value on the server
  and the visitor's zone after mount, the 14 timestamp call sites on `/account`,
  `/admin`, the dashboard cards, `/models` and `/compare` use it, and
  `formatDate` was replaced by `formatCalendarDay` for date-only values that must
  not be shifted. No stored value, query, billing boundary or dependency
  changed. Receipt: `npx tsc --noEmit` exit 0, lint clean on the changed files,
  dev server 200 on `/`, `/models`, `/compare` and 307 (auth gate) on `/admin`
  and `/account`, and a `/compare` DOM read showing "1:58 AM EDT" where the
  stored instant is 05:58 UTC, on a 12-hour clock both before and after the
  swap. Uncommitted with the compare feature it touches;
  the auth-gated tables are typechecked and linted, not re-rendered.
- 2026-10-30: **Customer policies v1 published (FID-2026-1030-061).** The
  operator returned the 61-question sheet in `docs/policies/answer-sheet.md`
  and signed off on publishing version 1.0. Served text now lives in
  `content/legal/v1/{terms,privacy,refunds,acceptable-use}.md`, with metadata in
  `lib/legal-meta.ts`, a narrow Markdown parser in `lib/legal-markdown.ts`, and
  static pages at `/terms`, `/privacy`, `/refunds`, `/acceptable-use`, plus the
  permanent `/legal/v1/<slug>` routes and a `/legal` index. The footer links all
  four, which is the notice path. Acceptance is enforced rather than declared:
  signup requires the checkbox and the API refuses an account without
  `acceptedPolicies: true`, storing a `policy_acceptances` row in the same
  request; existing accounts are asked once on `/account`; the row is keyed by
  version, is idempotent and cascades with the account. Positions the answer
  sheet delegated were chosen and are listed in `docs/policies/README.md`
  (three-month liability cap, 30-day log/backup retention, 30-day request
  deadline, no voluntary refunds beyond duplicate/unauthorized charges and
  statutory rights, no expiry, concrete excluded data and high-impact-use
  limits). Drafts moved unchanged to `docs/policies/drafts/` as review history.
  Receipt: `npm run verify` exit 0 — 311 unit tests, 421 HTTP checks, trial HTTP
  PASS, quality PASS (290 files), 12 static/SSG pages including the four
  policies. **Open:** no registered address is published, Stripe Tax is assumed,
  and no counsel reviewed the text; the operator accepted the last one.
- 2026-10-30: **Policy v1.1 published (FID-2026-1030-061).** Two statements in
  the same-day v1 publication were wrong and are corrected rather than left in
  place. The tax paragraph promised Stripe tax calculation that the checkout
  session never requests (`automatic_tax`, `tax_id_collection` and invoice
  creation are all absent), so v1.1 states that no tax is calculated or
  collected, no separate invoice is issued, and the buyer is responsible for
  applicable tax. v1 also printed no registered address; the operator confirmed
  the entity is not registered, so v1.1 says that plainly, names Kentucky, and
  offers a postal address on request instead of inventing one. `v1` remains
  reachable at `/legal/v1/<slug>` marked superseded; acceptance is version-keyed,
  so v1 acceptors are asked again and their earlier row is preserved. Receipt:
  `npm run verify` exit 0 — 312 unit tests, 423 HTTP checks, trial HTTP PASS,
  quality PASS.
- 2026-10-30: **Hosting candidate checked: Vercel is not compatible as built.**
  The operator named Vercel as the most likely host. Checked against Vercel's
  documentation: runtime logs are retained 1 hour on Hobby, 1 day on Pro and 3
  days on Enterprise, with Observability Plus extending to about 30 days, so the
  published "up to 30 days" depends on that add-on; Hobby is non-commercial only,
  so a paid gateway needs Pro; and SQLite cannot be used at all because functions
  have a read-only filesystem and ephemeral per-instance `/tmp`. This repository
  opens `better-sqlite3` at `DB_PATH` with WAL and one writer, keeps rate limiters
  in process, and settles inside the streaming request, so on Vercel balances,
  holds and the ledger would diverge per instance and the signup/login bounds
  would become per-instance best effort. Two paths recorded in
  `docs/launch-plan.md` Phase 3: a persistent Node host with a durable volume
  (no code change), or Vercel Pro plus an external transactional database and
  shared rate limiting (a migration FID with settlement and replay re-proof).
  No code, schema or policy text changed; the retention gate is now partly
  answered and the rest waits on the host decision.
