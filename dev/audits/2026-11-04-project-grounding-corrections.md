# Project grounding, audit corrections and coding handoff

Date: 2026-11-04. Source baseline: `b2eef8dcbd11ddc194b2232bef2366ad7485b31e`.

This corrects the interpretation and priorities in the
[original audit](2026-11-04-release-readiness.md). Its dated verification and load
receipts remain evidence; its assumptions are not operator decisions.

## Operator decisions and immediate outcome

The task is an audit and handoff. Implementation belongs to a separate worker.
Keep Vercel and the existing database. The current goal is production-correct
engineering and a complete NOWPayments sandbox journey without real money;
there is no launch deadline. A later small test group will use coding tools and
agents. More content is the first product priority. Prefer existing infrastructure
and building over new paid services. No purchase or funding action is authorized
by this report.

The single-agent ECHO contract remains unchanged. In particular, the operator
rejected an exception for TypeScript `unknown`. The original recommendation to
seek that exception is withdrawn. The questionnaire is preserved verbatim in
[the answers](../../docs/release-audit-answers.md), including its corrected assumptions.

**Assessment:** substantial features and automated coverage exist. The measured
load failures, process-local admission and inspected resilience gaps still
require engineering. An incomplete public-launch receipt does not mean sandbox
development is blocked, payment implementation is absent, or prior tests never
happened. This audit does not certify complete ECHO compliance or authorize launch.

## What the product actually does

| Surface | Existing behavior and source anchors | Audit implication |
| --- | --- | --- |
| Gateway | OpenAI-compatible JSON/SSE completion path, scoped customer keys, rate/admission checks, reservations and durable settlement: `app/v1/chat/completions/route.ts`, `lib/storage/gateway/call.ts` | Test the production path and refusal causes; do not propose a replacement gateway |
| Provider catalog | Provider registry, scoped sync, stable published model IDs, route election, operator pricing and persistent manual group assignments: `lib/providers/`, `lib/storage/store/routes.ts`, `lib/model-routing.ts` | Family, upstream provider and billing group are separate concepts |
| Billing | Exactly one of free, subscription or credit per call; ledger, holds and quarantine; subscription snapshots and weighted allowance | Preserve accounting and entitlement semantics while changing admission |
| Commerce | NOWPayments invoice checkout and signed fulfillment; Stripe paths; plan-sales and trial controls | Credential presence, enabled sales and a completed provider sandbox test are three separate facts |
| Signal ingestion | Six supported source kinds: RSS, Reddit, YouTube, Hugging Face, Trendshift and Hacker News; sixteen source presets: `lib/content/types.ts`, `lib/content/presets.ts` | Expand and curate the existing registry before inventing another feed system |
| Signal reading | Articles, papers, repositories, videos and discussions; search, rising/movers, source status, model links, digest and RSS | More volume needs coverage, freshness and duplicate controls |
| Signal engagement | Follows, saves, reactions, threaded comments and a watched-model briefing: `lib/content/store/engagement.ts` | These are existing features, not missing feature suggestions. The briefing is a bounded recent-content query, not AI personalization |
| Operations | Catalog, content, identity, groups, plans, subscriptions, providers, support, gateway, pricing, analytics and diagnostics admin surfaces | Improve existing workflows rather than add a second control plane |
| Identity | Sealed protocols, run references and published advisory results: `lib/identity/protocol.ts` | Do not describe behavioral evidence as authentication of model weights |

This is a path-based review with repository-wide inventories and gates, not a
claim that every source file or archived FID was manually reviewed end to end.

## Hosting and persistence: facts versus historical assumptions

The current storage authority uses PostgreSQL semantics. `lib/storage/database.ts`
and `lib/storage/runtime.ts` select local PGlite when no network URL is supplied;
a configured URL selects network PostgreSQL. Production requires network
PostgreSQL. The older SQLite records describe an earlier implementation. This
is not two competing production persistence systems.

Read-only checks in this follow-up established:

| Check | Observed result | Limit |
| --- | --- | --- |
| Local database URLs | Both configured connection variables classify as Supabase hosts | Does not identify the hosted production database |
| Local configured database | PostgreSQL 17.11; 44 models, 16 sources, 549 content items | Read-only transaction; counts describe only this database at observation time |
| Content inventory | 12 RSS sources and one each Hacker News, Hugging Face, Trendshift and YouTube; 244 articles, 215 papers, 36 discussions, 24 repositories, 30 videos | Stored active/enabled labels are not fresh fetch-health evidence |
| Vercel deployment | Linked project's latest production deployment Ready at `b2eef8d` | Ready does not prove customer journeys work |
| Hosted database identity | Production `DATABASE_URL` exists; its sensitive value was inaccessible through the inspected metadata | Operator identifies Vercel-provided Neon. Host verification still needs a safe hosted receipt; do not substitute the local Supabase host |
| Runtime | Package declares Node 22; CI/workstation use 24; Vercel project is configured for 26 | Align the actual deployment setting as well as repository declarations |

The database vendor is not a reason to migrate. Confirm the intended deployed
connection and its operational guarantees while retaining the existing database.
No database migration, schema initialization or configuration write was performed
in this follow-up. The direct inventory query used `BEGIN READ ONLY` and rollback.

## Configuration and provider checks

Only presence, non-secret flags and allowlisted metadata were recorded.

| Surface | Local observation | Meaning |
| --- | --- | --- |
| Default upstream | `PROVIDER_KEY` present | Credentials exist; spendable paid balance is separate |
| Other upstreams | Apixo key present; CommandCode key absent | Local registry has Apixo disabled and CommandCode enabled; reconcile enabled routes with their credentials |
| NOWPayments | API key and IPN secret present; sandbox flag false; top-up enable flag unset | Local configuration currently selects the live API host while checkout remains disabled. This is not a running sandbox checkout |
| Stripe | Secret/webhook credentials absent locally | Vercel's visible production names include a Stripe secret; do not generalize local absence to production |
| Email and alerts | Local sender/transport/Resend and alert destination variables absent | Does not establish hosted configuration or disprove historical delivery tests |
| Content scheduler | Local ingestion-enable and cron-secret variables absent | Manual fetches and stored content can exist without local scheduled ingestion |

Vercel's visible production inventory included provider, database, admin, site
URL and Stripe names. It did not establish NOWPayments or sender readiness.
Sensitive/hidden environment metadata means this is not a complete inventory.
Do not export production secrets into the repository to resolve this distinction.

A fresh authenticated GET of the default provider's balance reported no paid
balance and 15 RPM. Its subscription GET reported free access disallowed while
remaining tokens were positive. These are separate fields: positive remaining
tokens do not override an explicit access denial. These were metadata calls,
not inference requests; no provider status, price or account balance was changed.

## NOWPayments: correct development acceptance target

Sandbox selection already exists in `lib/nowpayments.ts`; its tests explicitly
exercise the sandbox invoice URL. Checkout creates a stored top-up and hosted
invoice through `app/api/account/topup/crypto/route.ts`. The webhook verifies the
signature before fulfillment, handles nonfinal states, and uses durable claims
and amount/currency matching before crediting once. This is implemented behavior,
not a missing integration.

The worker should prove the following in an isolated sandbox deployment/database:

1. Explicit sandbox host selection, sandbox credentials, checkout enablement and
   callback origin agree. Determine whether the existing credential pair is a
   sandbox pair without printing it or assuming live credentials also work there.
2. A customer creates an invoice through the actual account checkout. Exercise
   the provider's supported simulation mechanism and receive its signed callback.
   Record invoice/payment/top-up correlation with secrets redacted.
3. Nonfinal status adds no credit; finished adds exactly one credit; duplicate,
   out-of-order, invalid-signature and amount/currency-mismatch callbacks preserve
   the expected ledger/quarantine state.
4. A return-page redirect alone never proves payment. Verify account balance and
   the ledger, then test spending/settlement using a deterministic upstream fixture.
   Actual paid upstream inference is a separate acceptance step requiring funding.
5. Verify sandbox callbacks cannot credit live customer funds. The reviewed
   callback path passes a null live-mode marker; this is a test/design question,
   not a demonstrated cross-environment exploit.

Official documentation fetched through Context7 confirms hosted invoice checkout
and signed IPNs, but the retrieved material did not establish the exact sandbox
simulation procedure or sandbox invoice support. Verify that contract before
promising the hosted invoice journey. A mocked invoice unit test is not that proof.
See [NOWPayments API documentation](https://documenter.getpostman.com/view/7907941/2s93JusNJt).

This plan needs no real cryptocurrency transfer. The older public paid-launch
receipt keeps its separate acceptance requirements; do not fabricate those
observations or silently redefine them to pass development checks.

## Ordered coding handoff

These are recommendations for implementation under converged FIDs, not completed
repairs. The original fourteen engineering findings remain recorded; refinements
here replace conflicting priorities or assumptions.

| Order | Finding and evidence strength | Required proof |
| --- | --- | --- |
| 1 | Vercel admission safety: source-confirmed process-local Maps; independent-process probe admitted both callers at a configured limit of one | Shared provider/account limits with bounded leases; race two application instances across all billing sources, cancellation and crash recovery. Keep Vercel |
| 2 | Unexpected free refusals: isolated load reproduced six mixed free 429s and a post-reset 429 | Capture exact refusal reason and admission/refresh timing; add a deterministic concurrency regression before selecting a fix |
| 3 | Database latency/recovery: measured 4.54 rps and 2,152.52 ms steady p95; inspected unbounded pool wait and rollback-discard gap | Profile transactions/round trips, bound acquisition, discard broken clients, demonstrate recovery and remeasure on the intended topology. No target waivers just to turn tests green |
| 4 | Sandbox customer journey: integration exists; fresh provider sandbox receipt not produced by this audit | Complete the isolated checkout-to-callback-to-ledger proof above, with no real funds |
| 5 | Content reliability: body read precedes size enforcement; sequential ten-source cron can exceed its 60-second budget | Bound actual bytes and redirect destinations; durable source claims/deadlines; prove fair eventual source coverage and retry safety |
| 6 | Runtime/background execution: deployment Node 26 differs from package/CI; catalog refresh detaches work | One tested runtime contract; request-lifecycle/durable refresh completion and safe multi-instance retries |
| 7 | Strict ECHO compliance: existing `unknown` annotations conflict with the unchanged rule | Inventory each boundary and design concrete classes/domain parsers with runtime validation; no `any`, unchecked casts or renamed aliases to disguise the forbidden type |
| 8 | Remaining assurance/QOL: TLS provisioning trust, policy currency, gate divergence, governance checks and browser evidence | Retain every original finding; deliver bounded proofs and accurate current docs. Preserve old receipts and policy versions |

A specific hypothesis for item 2: `reserveTrialRoute` refreshes provider
observations, while claiming a refresh clears persisted observation timestamps.
Calls whose refreshes finish at different times may encounter another call's
new lease before reservation. That could explain refusals; it is not yet a
confirmed root cause. Trace `lib/storage/gateway/trial.ts`,
`lib/storage/providers/runtime.ts` and `lib/storage/ledger/quota.ts`. Preserve
the operator's fresh-quota requirement rather than masking the race with a
longer cache or larger rate limit.

## More content, then stronger reasons to return

The highest-impact product work is to make the existing ingestion system deliver
more useful coverage. Start by measuring the sixteen configured sources: latest
successful cycle, items accepted, duplicates, errors and model-link coverage.
The 549 stored items are a stock count, not proof of current publishing cadence.

| Priority | Proposal | Why it fits / how to judge it |
| --- | --- | --- |
| 1 | Add and curate sources through the current admin registry | Fill under-covered model families and coding/agent topics. Track unique useful items per week and distribution across topics; avoid adding sources merely to increase counts |
| 2 | Improve ingestion coverage and freshness | Use existing fetch-now, cycles and source-status controls. Diagnose skipped/stale sources and duplicates before adding another scheduler or paid aggregator |
| 3 | Editorial coding/agent collections | Curate release notes, papers and repositories into practical reading paths with source attribution and exact catalog links. Preserve a clear distinction between editorial claims and measured model capability |
| 4 | “What changed in my stack?” | Extend existing watched-model briefings with a last-visit boundary and relevant price/access changes. Measure return visits and opened coverage, not just follows |
| 5 | Article-to-workflow cards | Pair selected coverage with a user-triggered coding recipe and explicit model/access/cost information. Reuse follows/saves; never run paid prompts automatically |
| 6 | Weekly research trails | Curate a paper, implementation repository and available model around one task. Start with editorial collections; personal notes/public sharing would be new scoped features |

Customer QOL should support those flows: preserve useful filters/navigation,
make saved content easy to revisit, explain refusal/reset/credit states, and
offer exact model-ID setup snippets for coding clients. First confirm the current
UI behavior before filing any of these as missing features.

Operator QOL should extend existing diagnostics and content administration with
actionable freshness/failed-cycle views and links from payment incidents to their
redacted claims, ledger and quarantine records. Avoid a duplicate configuration
store or a speculative new dashboard. Browser checks should cover mobile,
keyboard/focus, video, replies, search and account payment states in both themes.

## Evidence and completion limits

The earlier full verification passed ten gates, 980 tests, two PostgreSQL
concurrency proofs, HTTP/trial and recovery checks. The isolated load run passed
115 of 123 checks with balanced ledger/held totals. Those are dated receipts from
the original audit, not tests rerun for this documentation follow-up.

Follow-up evidence consists of source review, safe configuration inspection,
read-only database/provider queries and Vercel metadata. No application code,
environment, price, payment state or deployment was changed. No inference,
payment, email or alert was sent. No blanket ECHO compliance claim is justified.
