# Savant Gateway release readiness audit — 2026-11-04

> **Read the [grounding corrections and coding handoff](2026-11-04-project-grounding-corrections.md)
> first.** The operator clarified the current milestone, hosting, content priority
> and strict type rule after this report. That companion supersedes conflicting
> recommendations below. Dated test results remain unchanged.
>
> **2026-11-04 operator ruling —** funded paid inference was withdrawn from the
> required launch test scope ("i do not have a sandbox, im not going to fund a
> wallet to light money on fire to satisfy some made up requirement i did not
> make"). `npm run receipt:launch` now requires five observations (`payment`,
> `recovery`, `alert`, `load`, `rollback`); finding 3's "six" count and its
> funded-inference wording are superseded. Funded inference remains unverified.

## Decision

**NO-GO for a public paid launch.** The repository has substantial accounting,
security and recovery coverage, but its release evidence is incomplete and its
documented single-process admission contract does not establish safety on the
recorded Vercel topology. Passing local gates cannot resolve that mismatch.

The highest-value next work is: coordinate admission across the actual runtime,
establish a measured PostgreSQL capacity envelope, and finish one real payment
through paid-inference journey with reconciliation. Product growth work should
then shorten the path from Signal discovery to a successful first request.

This is an engineering/product audit, not legal advice, a penetration-test
certification, or permission to activate sales. No production database, price,
payment, release flag or recipient was changed by this audit. No deployment
command or release approval was issued; normal repository delivery can trigger
the existing Git-connected build.

## Correction — 2026-11-04T16:24Z (load refusals and free-tier supply)

The isolated load receipt recorded eight failures, three of which this report
left open as possible product behavior. A follow-up read-only check of the
serving upstream and the free-pool code reclassifies them as fixture accounting.
This section corrects the reading; the dated observations above are unchanged.

**Live supply, read-only, values only:**

| Call | Result |
| --- | --- |
| `GET /balance` | 200; `rpm: 15`, `rpm_plan: "free"`, `balance_usd: 0` |
| `GET /subscription` | 200; `mode: "free"`, `token_limit: 20,000,000`, `tokens_used: 0`, `tokens_remaining: 20,000,000`, `allowed: true` |

The account holds the full 20,000,000 weighted-token daily grant and a 15 RPM
request ceiling. They are separate axes: the grant limits weighted tokens per
UTC day, the RPM limits requests per minute. `0/20M used` also confirms the load
fixture never reached upstream, as designed.

**The 900 was local.** The six mixed-billing 429s and the post-reset free 429
carried `Daily trial-credit allocation reached (900 weighted tokens)` while
`TRIAL_ENABLED=false`. That text comes from `lib/free-pool.ts:171`, the single
formatter on the shared path; `lib/allocation.ts:174` holds the mode-correct
wording but is not used there. The 900 is the account's allocated share:
`floor(0.9 × 1,000) = 900` across one active account, passed in by
`lib/storage/store/free-pool.ts` as `dailyWeightedTokens`. The load runner pins
`FREE_POOL_ALLOCATION_ENABLED`, `FREE_ACCOUNT_DAILY_CAP`, `FREE_SHARED_RPM` and
`PAID_KEY_RPM` (`scripts/load/envelope.mjs:153`) but neither the daily pool nor
the allocation share, so `next start` loaded a development-scale `.env.local`
value that the HTTP suite pins away (`scripts/http-suite.mjs:88`). A stored
settings row can override the environment as well, so a pin alone would not
have been proof.

Reclassification of the eight failures:

| Failure | Class | Cause |
| --- | --- | --- |
| mixed status counts `{200:18,429:6}` | fixture | 1,000-token local pool, not upstream |
| six free rather than twelve free usage rows | fixture | the same refusal |
| 429 on the post-reset free probe | fixture | the same exhausted free user |
| steady 4.54 rps against 20 | capacity | database path |
| steady p95 2,152.52ms against 1,500 | capacity | database path |
| three ramp latency checks | capacity | database path |

Five failures remain real. The same run's 300 committed settlements, zero
ledger/held differences and zero unresolved settlements still support the
accounting-integrity reading; they were never capacity evidence.

**Supply math, not a target change.** 20M weighted tokens per day averages 231
weighted tokens per second; 15 RPM is 21,600 requests per day. The break-even is
20M ÷ 21,600 ≈ 926 weighted tokens per call. At weight 3 that is about 309 raw
tokens, so for typical calls the daily grant binds just before the request
ceiling, giving a sustained free-tier ceiling near 0.19–0.25 rps. The 20 rps
steady target therefore measures gateway overhead under burst, not sustained
customer capacity, and it cannot hold for a full day on this plan: 20 rps at
about 1,200 weighted tokens per call would need ~2.07B weighted tokens per day,
roughly 104× the grant. The target is not lowered here.

Contract: [FID-2026-1104-003](../fids/FID-2026-1104-003-free-allocation-refusal-truth.md)
(converged, design only). It requires one limit-aware refusal builder, both
environment families pinned, the resolved policy read back after boot, refusal
reasons recorded in the load JSON, and the observed supply declared in the
envelope.

## Correction — 2026-11-04 (NOWPayments acceptance ruling)

The operator confirmed that both live NOWPayments invoices were creation-only
("These were only created") and ruled the vendor sandbox track dropped: the
vendor is a managed service outside the repository's control, and the lane is to
be assumed working as wired ("It's a service, so just assume it works as we have
it wired."). FID-2026-1104-012 is archived as `closed — operator-approved
non-pursuit`.

This changes a disposition, not the evidence. No sandbox run, paid invoice,
provider-delivered IPN or replay refusal exists. Finding 3's payment component is
accepted as an assumption by the operator; the remaining components (paid
inference, hosted restore, delivered alert, drain/rollback, GO receipt) and the
NO-GO decision are unchanged.

## Coverage and evidence standard

Baseline: `d0c7861f6eff95deaaee5557fe6735a220f0673a`, Windows, Node v24.21.0,
npm 12.2.1. Structural census before new audit records:

| Surface | Count |
| --- | ---: |
| Tracked files | 1,156 |
| Application source files in app/components/lib/config | 597 |
| Source lines, including blanks | 78,478 |
| Test files matched by the package test glob | 144 |
| Route handlers / pages | 72 / 50 |
| FID records in active and archive folders | 157 |

The audit combines repository-wide inventories/searches and executed gates with
selected full-file reviews of admission, settlement, quarantine, storage adapter,
pool configuration, request bounds, receipt validation, gate wiring, content
ingestion and customer/product surfaces. It does **not** claim manual 0–EOF
review of every one of the 597 source files or every archived FID.

Evidence classes used below: **reproduced** means an executed failure;
**source-confirmed** means a directly inspected implementation property;
**recorded** means an existing dated receipt rather than a new observation;
**proposal** means a suggested feature, with no implementation or measured lift.

## Repairs completed during the audit

| Finding | Before | Repair and proof |
| --- | --- | --- |
| Release approval pin, high | Receipt pin matched HEAD but approval named another commit; verdict was `pass` | Compare approval SHA with pinned SHA; regression requires `stale` |
| Verification evidence, high | Required test gate exited zero with `No tests executed`; verdict was `pass` | Require nonempty, complete, consistent successful test totals; accept spec/TAP reporters |
| Zero-warning lint, medium | Baseline printed six warnings and exited zero | Shared command is `eslint . --max-warnings=0`; six formatting warnings corrected directly |
| Concurrent quarantine release, high | Two real connections both returned success for one release | Lock the quarantine row before changing aggregate held capacity; real-connection regression preserves 200 of 300 micros after one 100-micro release |
| FID register, medium | Exact IDs 127/137 were absent from SCOPE; two closed records said only “containing commit” | Register exact active IDs and append verified original SHA `8a45c2f83565b5cbbe7faed31df177e8b38e94e8` to records 113/114 |

Guard regressions: 15/15 pass. Ledger/concurrency focused run: 19/19 pass.
The quarantine RED run failed with `one quarantine may be released only once:
2 !== 1`. Its first probe could not observe pooler application names; the final
regression observes database-local lock waits before unblocking either release.

Contracts: FID-2026-1104-001 and FID-2026-1104-002. Final gate receipt and commit
references are in the dated session summary and the FID implementation evidence.

## Executed verification

Implementation commit: `43d875840774e8572a9e898567009c48ed106844`.
The full gate completed 2026-11-04T14:57:28Z in 272.1 seconds. The source repair
was unchanged between that run and the implementation commit.

| Command / gate | Observed result |
| --- | --- |
| `npm run verify:supabase` | Exit 0; all ten configured gates PASS on a generated disposable DB |
| Lint / typecheck | Exit 0; zero lint warnings; type generation and strict compilation pass |
| Unit/integration tests | 980/980 pass, zero skipped |
| Mandatory PostgreSQL proof | 2/2 pass: racing debit and racing quarantine release |
| Storage / config check | PASS; zero legacy SQLite importers; config check explicitly non-production |
| Quality / build | PASS; 597 application files satisfy the 400-line ceiling; production build succeeds |
| HTTP / trial HTTP | 803 checks PASS; trial suite all checks PASS on real PostgreSQL |
| Recovery | PASS: dump, restore, reconciliation, replay and refusal checks |
| Attribution / `git diff --check` | Exit 0 |
| `npm audit --omit=dev --json` | Exit 0; zero known production dependency vulnerabilities |
| `npm run receipt:launch` | Expected exit 1: INCOMPLETE, six missing observations |
| Separate isolated load measurement | Exit 1: 115/123 checks pass, eight fail; release remains no-go |

Raw verification logs and summary are in `.verify/`. Durable load receipts:
[diagnostic overlap run](2026-11-04-load-acceptance.json) and
[isolated run](2026-11-04-load-isolated.json). The latter was run without the
HTTP gate competing locally; other activity on the managed server is not known.
Both generated databases were dropped, as was the full-verification database.

## Ranked release and engineering findings

Ranks combine severity, reach and dependency value. Effort is comparative,
not a delivery estimate. The dispositions below complete the **audit assessment**;
they do not imply that unimplemented recommendations are delivered fixes.

| Rank | Priority / evidence | Finding | Best next action / acceptance |
| ---: | --- | --- | --- |
| 1 | P0, source-confirmed + local probe | Provider/account limits are process-local on a product recorded as deployed to Vercel | Converge a shared admission design or explicitly select/enforce one persistent process. Race two independent application instances and prove one aggregate RPM/concurrency ceiling across free, credit and subscription calls |
| 2 | P0, recorded + executed load failure | Real PostgreSQL capacity has no accepted envelope; the new load run also reports mixed/free-path refusals (three of the eight are fixture drift; see the correction above) | Profile DB round trips, locks and refusal reasons, measure an isolated run on the intended topology, and have the operator accept the measured cohort/cap. Never substitute the historical SQLite throughput |
| 3 | P0, executed refusal | Real payment, paid JSON/SSE, hosted restore, received alert, drain/rollback and GO receipt are absent | Complete FIDs 062/127 against the pinned release artifact. `npm run receipt:launch` currently exits 1 and lists all six missing observations |
| 4 | P1, source-confirmed | Published policy remains v1.1 while the product added NOWPayments, account email, Signal saves/comments/reactions and Speed Insights | Prepare a new immutable policy version reflecting actual recipients, engagement data and retention; obtain operator publication approval and record reacceptance. Do not edit old effective text |
| 5 | P1, source-confirmed | Feed transport reads an entire body before checking its size and follows redirects by default | Stream-count actual response bytes, cancel at the limit, and validate every redirect/resolved destination. Test dishonest Content-Length, chunked oversize, private redirects and encoded IPs |
| 6 | P1, source-confirmed | DB pool acquisition is unbounded; failed rollback does not explicitly discard the leased client | Set a finite acquisition/connection budget; model `release(error)` and discard after rollback failure. Add pool saturation, failed rollback and connection recovery tests |
| 7 | P1, source-confirmed | Cron ingestion sequentially processes up to ten sources inside a 60-second route; one fetch may take 15 seconds before enrichment/DB work | Give work a total deadline with durable per-source claims/checkpoints, or one-source bounded jobs. Prove all sources eventually run and concurrent ticks do not duplicate cycles |
| 8 | P1, source-confirmed | Catalog refresh is a detached promise with per-handle coordination | Bind work to a supported request lifecycle or durable scheduler. Prove completion after response and safe retry/coordination across instances |
| 9 | P1, source-confirmed | Provisioning helper disables TLS certificate verification for remote servers while using the configured DB credential | Use the provider CA/trust chain and verified TLS. Test refusal of an untrusted certificate; keep disposable DB permissions separate from production runtime permissions |
| 10 | P2, source-confirmed | Declared Node 22 differs from Node 24 CI and this workstation | Choose one supported runtime and align package engines, lockfile policy, Docker, CI and deployment; prove a clean install and full gate on it |
| 11 | P2, source-confirmed | Local verify, CI and pre-push are separate gate lists | Generate/consume one gate contract, preserve topology-specific setup, and upload commit-bound receipts/raw logs from CI. Current CI omits `storage:check` and `receipt:deploy` from the main job; attribution has its own workflow |
| 12 | P2, evidence gap | Current Signal interaction/accessibility coverage is not a fresh browser receipt | Add focused browser journeys for palette, video Escape/focus return, replies/reactions, filters and mobile account flows in both themes. HTTP HTML checks cannot prove hydration or keyboard operation |
| 13 | P2, source-confirmed | Business events cover account/money lifecycle but do not measure the discovery-to-inference funnel | Extend the existing event authority with a small privacy-reviewed vocabulary; measure first successful request, content-to-model click, follow, save and return briefing use without storing prompts or keys |
| 14 | P2, source-confirmed | Compliance documents and historical indices mix obsolete topology/paths with current instructions | Add an executable governance check and a short current operating index; retain dated history and link it explicitly rather than rewriting it as present truth |

### Why admission is the first engineering priority

`lib/provider-admission.ts:63` holds serving-account capacity in a module Map;
`lib/gateway-rate-limit.ts:66` does the same for free/account buckets. Their
production caller is `lib/storage/gateway/call.ts`. Admin-login windows are
also in memory (`lib/admin-rate-limit.ts:18`).

An isolated-process probe loaded the production admission helper twice with the
same provider identity and a configured RPM/concurrency of one. Both processes
returned `ok: true`. This proves state isolation; it is not a measured hosted
overload. `lib/production-config.ts:221` checks conventional worker variables,
which does not establish that a platform serves only one application instance.

Prefer extending the existing PostgreSQL authority with atomic provider/account
admission and bounded expiring leases, or deliberately choosing an enforced
single-process host. Measure the extra transaction cost before selecting a
shared store. Changing a Next.js cache handler would not share these custom Maps.
Keep financial holds, provider capacity and customer fairness separate.

### Capacity and infrastructure resilience

The previous PostgreSQL receipt recorded 4.76 admitted requests/second and
1,974ms steady p95 against targets of 20 rps and 1,500ms, with two mixed-billing
503s. Those are **2026-11-03 observations**, not current production capacity.
The fixture's 6,000 RPM ceiling is a test setting; it is not a bought provider
entitlement. `config/load-envelope.json` explicitly labels the envelope candidate.

The audit's first load measurement also failed: 4.5 admitted rps, steady p95
2,297.5ms, six mixed-billing 429s and a refused free call after the quota-reset
probe. It retained zero ledger/held differences, zero unresolved admissions and
five deliberate crash/storage quarantines. It overlapped the HTTP gate on the
same database server, so it is a diagnostic run, not an isolated capacity claim.
The isolated repeat at 2026-11-04T15:03:53Z reproduced eight failures: steady
4.54 rps against 20, steady p95 2,152.52ms against 1,500ms, three ramp latency
failures, mixed status counts `{200:18,429:6}`, six free rather than twelve free
usage rows, and a 429 on the post-reset free probe. Peak RSS was 173.6 MB.
There were 300 committed settlements, zero admitted/unresolved settlements,
five deliberate quarantines and zero ledger/held differences. Refusal causes
must be investigated before attributing every failure to database latency; the
correction above resolves three of the eight as fixture accounting and leaves
five as capacity.

The pool caps each process at ten clients but sets no `connectionTimeoutMillis`
(`lib/storage/pg-pool.ts:37`). Server-side statement timeouts start after a
statement reaches a connection and do not bound time waiting for a pool slot.
The adapter's rollback-failure comment promises disposal, but
`lib/storage/pg-adapter.ts:325` calls `release()` without the error/discard flag.
These are inspected failure-handling gaps; no live outage is asserted.

Initialization failures also remain cached until restart. Keep a fail-closed
schema policy, but decide explicitly how transient connectivity recovers and
how readiness triggers replacement. Test simultaneous cold starts and migration
locks on the chosen topology before claiming rolling-deploy safety.

### Content freshness and transport

The cron route declares `maxDuration = 60` and requests ten sources; ingestion
awaits them sequentially. Ten individual 15-second fetch budgets can already
exceed that route duration, before enrichment. A shorter batch alone does not
bound an individual source with many enrichment calls. This is a possible
deadline overrun derived from the code, not an observed hosted timeout.

`lib/content/ingest-fetch.ts:81` calls `response.text()` before the size check;
the later check counts JavaScript characters rather than network bytes. The URL
policy documents DNS rebinding as an unresolved limitation. A public source can
also redirect after initial validation. Centralize transport bounds and destination
checks across feed and reader paths, with safe failure reporting.

## ECHO compliance assessment

**Partial compliance; no blanket certification.** Gate execution and attribution
enforcement are concrete strengths. Historical workflow ordering cannot be proved
from final Markdown status alone. This session used one worker, recorded scope
and converged both repair FIDs before code, and used direct file edits.

| Law / requirement | Assessment |
| --- | --- |
| 1: Read before edit; no scripted edits | Every file edited in this audit was read; changes use direct patches. No retroactive claim about earlier sessions |
| 2: Present before act; operator scope | Scope and repair impact recorded under autonomy 3. Real payments, policy publication, deployment and release remain operator decisions |
| 3/15: Verification, zero warnings | Baseline violated the zero-warning bar despite exit zero. Lint warning enforcement and formatting are repaired; final evidence is linked below |
| 4: Production reachability | Receipt CLI → validator; verify runner → summary; admin settlement route → store façade → locked ledger function. New regressions run through existing declared gates |
| 5: No placeholders | Search found zero TODO/FIXME lines in the application census. This does not prove absence of every stub or dead branch |
| 6: Type safety | Zero `as any`, explicit `: any` or `@ts-ignore` matches in the census. **281 `: unknown` annotation lines in 108 files** conflict with the protocol's literal ban; many are appropriate trust boundaries, but that does not create an exception |
| 7/13: Reuse and one truth | Repairs extend shared authorities. Gate lists, JSON object guards and numeric input helpers still have overlap requiring targeted review |
| 8/10: Intent and tracking | Intent recorded in session summary; exact FID registration repaired. No discovered repair was silently discarded |
| 9/11: Documentation and patterns | Current docs retain old SQLite paths and topology claims. Examples: `knowledge.md`, module headers and hosted restore references. Preserve historical records; update current guidance deliberately |
| 12: Secrets and attribution | `npm run attribution` passed; output never prints credential values. Remote provisioning TLS trust remains a finding; this is not a comprehensive secret/history scan |
| 14: Failure handling | Quarantine race repaired; missing pool discard, acquisition deadline and detached/background work remain explicit findings |
| Closure and archive | Baseline scan found no duplicate IDs and no closed record in the active folder. Seven archived records use legacy `verified`, one `superseded`, and three did not match the simple status parser; these require migration rules rather than blind rewriting |

For Law 6, request an operator ruling that explicitly permits validated unknown
values at trust boundaries, then enforce domain types internally. Do not replace
safe `unknown` with `any` or unchecked assertions just to satisfy a text search.
This audit does not amend the governing contract.

The Windows verification/provisioning wrappers still emit Node `DEP0190` about
passing arguments with `shell: true`. Lint and build are warning-free; the whole
tooling run is **not** certified warning-free. Replace shell-based dispatch with
proper platform-specific argument handling and regression-test metacharacters;
do not hide the warning to satisfy the policy.

Recommended governance gate: check exact active-FID registration, ID uniqueness,
allowed new statuses, existence of promised tests, closure commit resolution,
active/archive consistency and current-document links. The repository has no
`fid:verify` or `validate:repository` binary; do not claim those checks ran.

## Product improvements with the highest expected value

These are hypotheses grounded in existing surfaces, not proven growth outcomes.
The product already has following, saves, reactions, replies, search, digest,
RSS, source status and model comparison. Building duplicate versions would add
little; connect those capabilities into a shorter, understandable journey.

| Order | Proposal | Build on | Success measure / boundary |
| ---: | --- | --- | --- |
| 1 | A “first successful request” setup flow | Account, key creation, free allocation, docs/start | Time and completion rate from signup to an actual 200 completion. Preserve one-time key reveal; never auto-spend or copy keys into URLs |
| 2 | Model-specific “Try this workflow” cards in Signal | Existing model links and comparison | Content → model → successful request conversion. Choose a published exact SKU and show access/cost before a user starts |
| 3 | A useful returning-reader home | Existing follows, saved items and seven-day briefing | Weekly returning readers, followed-model coverage opened, saved items revisited. Add last-seen watermarks and unread counts before email |
| 4 | Explain each request's bill | Stored usage provenance, charge, model and latency | Fewer billing support cases and fewer repeated failing calls. Show estimated vs provider usage, billing source and hold status without exposing upstream credentials or private margin |
| 5 | A workload cost planner | Existing input/output rates and comparison | Planner → selected model → first request. Let users set input/output mix and request volume; label estimates and source dates, and handle weighted free allowance separately |
| 6 | A transparent provider/model availability view | Diagnostics, readiness, source status | Lower repeated 503/429 attempts and faster recovery. “No observations” stays unknown, never 100% uptime |

### Creative engagement experiments

1. **The Signal lab:** an article-linked, curated prompt recipe with a visible
   purpose, exact model id and user-triggered trial. Readers can save a recipe
   and return after trying it. Do not execute arbitrary publisher prompts or
   assume a recipe's benchmark result applies to the reader's workload.
2. **“What changed in my stack?”** A briefing showing new coverage plus recorded
   price/access changes for followed models since the last visit. Reuse stored
   pricing decisions; distinguish a price observation from a quality claim.
3. **Share a decision:** a clean public comparison link for two selected models,
   workload mix and a dated price snapshot. No customer balance, key or private
   prompt is embedded. Measure visitors who reach a model or successful request.
4. **Weekly build challenges:** one bounded, editorial task and optional
   user-submitted solutions tied to available models. Invite explanations,
   not paid-call volume. Any reward requires a separately approved issuance cap
   and fraud checks through the existing promo ledger.
5. **Research trails:** let readers collect a paper, repository and model into
   a saved bundle with private notes. Start private; public sharing needs
   moderation, deletion and explicit visibility controls.
6. **Community usefulness:** show which discussions or recipes readers found
   useful, with source provenance and a named time window. Existing reactions
   can inform a view; they must not masquerade as model quality or verified users.

Prioritize experiments 1–3. They reuse existing content/model relationships and
can be tested without a new reward currency, social graph or outbound channel.

## Quality-of-life improvements

| Audience | Improvement | Concrete result |
| --- | --- | --- |
| Customer | Copy model-specific setup snippets | Exact catalog id, canonical base URL and selected language; key stays local and is never logged |
| Customer | Searchable usage/history with CSV export | Date/model/status/billing-source filters, UTC values plus local display, scoped export |
| Customer | Clear 402/429/503 next steps | Allocation reset, credit requirement or retry guidance linked to the relevant repair |
| Customer | Remember catalog and comparison filters in URL | Shareable state and predictable Back navigation |
| Customer | Key labels, last use, rotation help and future budget controls | Safer key ownership; any hard spend cap needs admission/settlement semantics that survive overrun and races |
| Operator | One readiness dashboard with ownership | Key readiness, feed delay, held/quarantined funds, alert delivery and next required action; no duplicated configuration store |
| Operator | Preview/diff before bulk pricing changes | Reuse guarded recommendations and decision history; show stale/unknown cost and require deliberate approval |
| Operator | Payment and settlement investigation links | Move from an incident to its redacted event, ledger entries and quarantine without querying raw tables |
| Maintainer | Runtime and gate alignment | Reproducible clean install, commit-bound verification receipt and visible coverage gaps |
| Maintainer | Focused integration/browser checks | Spend test effort on concurrency, hydration, accessibility and actual money paths rather than mirrored helper tests |

## Recommended order and release conditions

1. Complete the bounded audit repairs and retain RED/GREEN evidence.
2. Converge the topology/admission design and measure the database path; prove
   aggregate safety using two independent application instances.
3. Profile and satisfy the candidate load targets, or obtain a dated operator
   ruling changing them after reviewing the measurements. Do not loosen targets
   merely to make a gate green.
4. Complete transport/resource hardening, bounded jobs, DB fault recovery and a
   fresh browser matrix on the intended release artifact.
5. Approve/publish accurate policies; confirm email/alert sender destinations,
   backup retention and actual hosting behavior with controlled receipts.
6. Execute the six real acceptance observations and the explicit go/no-go on the
   pinned artifact with a bounded cohort/spend cap. Keep plan/trial/payment flags
   consistent with the existing operator decisions.
7. Measure activation and returning-reader behavior, then implement the first
   product experiment with an agreed success metric.

Current operator-owned blockers remain in FIDs 043, 062, 068, 127 and 137.
Direct USDC inputs are not silently treated as a launched payment path.
Recommendations in this report are assessed proposals, not added promises that
the product already implements them.

## Documentation sources and verification limits

Framework/pool details were checked with Context7 against the primary Next.js
and node-postgres documentation and the installed Next.js self-hosting guide:
[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[pg Pool](https://node-postgres.com/apis/pool), and
[pg SSL](https://node-postgres.com/features/ssl). The repository's custom Maps
and adapter behavior were verified from local source, not inferred from those
libraries' default behavior.

No new live provider call, real payment, outbound email/alert, deployed-origin
browser check, container build or legal/retention acceptance was performed.
Dependency audit reported zero known production vulnerabilities at the time of
the run; this is not proof of zero security defects. No revenue lift, SEO lift,
conversion lift or current production capacity is claimed.
