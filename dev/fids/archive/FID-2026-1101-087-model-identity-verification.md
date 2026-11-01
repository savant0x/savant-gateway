# FID: Admin-run model identity verification, free-pool first

**Filename:** `FID-2026-1101-087-model-identity-verification.md`
**ID:** FID-2026-1101-087
**Severity:** high
**Status:** verified (implementation, feature gates, commit, and live receipt complete; whole-repo HTTP gate blocked by FID-086)
**Created:** 2026-11-01 12:27 EST
**Automation level:** 3
**YAGNI-Compliance:** Verified

> Scope of this record: the plan, the product contract, and the implemented
> lane. The operator granted automation level 3 on 2026-11-01, so implementation
> and closure are within approved scope. The whole-repo `npm run verify` gate
> remains blocked by FID-086's incomplete storage flip; the exact failure is
> recorded under Verification Gates and is not claimed as a pass.

---

## Summary

The gateway can tell a customer what a model costs, what its group is, and what
an external benchmark says about its quality. It cannot tell the customer
whether the upstream route serving that model id is actually running the claimed
model, whether a hidden system prompt was injected, whether the advertised
context is real, or whether the stream is well formed. Those are identity
questions, and no code in this repository measures them.

This FID defines the first advisory identity slice the operator approved on
2026-11-01: an **admin-run**, **operator-published**, **API-only** verification
of the **free-pool** routes. The operator starts a run, the worker probes the
upstream directly, the evidence is stored in an isolated `identity` Postgres
schema, the operator reviews it, and a published advisory panel appears on the
model's public page. Nothing in this FID blocks a request, charges a customer,
debts operator credit, or makes a weight-level claim. The statistical result is
relative to a measured noise envelope, never a composite score, and a
same-route reference is labelled self-consistency rather than identity
verification.

The design deliberately reimplements the useful ideas from the ten reference
repositories surveyed in `docs/research/aio-source-review.md`; none of them is a
runtime dependency. `api-relay-audit` is AGPL-3.0-only and contributes concepts
only, with zero code reuse.

## Environment

- **OS:** win32 (Windows 11), bash via Git Bash
- **Language/Runtime:** TypeScript 5.9 strict, Node 22.18+ (local 24.21.0),
  npm 12.2.1
- **Tool Versions:** Next.js 16.4.3, HeroUI 3.2.7, `pg` 8.23.1,
  `@electric-sql/pglite` 0.5.14, `better-sqlite3` 13.0.3
- **Commit/State:** `ffcb8b2` on `main`. The commit carries this identity lane
  and the PostgreSQL storage handle and schema it depends on (FID-085/FID-086);
  the live request path is still hybrid, so the HTTP suite remains blocked.
  Research material under `resources/` and `docs/research/` stays untracked.

## Detailed Description

### Problem

A customer choosing a model sees a price, a group, a context window, and an
Artificial Analysis quality score. None of those is evidence about the route
that will answer the request. The failure classes that matter commercially are
silent: a different model family behind the same id, a smaller checkpoint under
a larger name, a hidden system prompt that changes every answer, a context
window that is advertised but silently truncated, a proxy that rewrites tool
calls, or a stream that is not the protocol it claims to be.

The operator has no place to record what was tested, no reference to compare
against, and no review step before a result becomes public. The only current
"benchmark" is the Artificial Analysis sync, which measures model quality from a
third party and has no relationship to route identity:

- `components/admin/benchmark-panel.tsx:42` renders the AA sync status.
- `app/admin/(panel)/catalog/page.tsx:49` mounts it on the catalog page.
- `lib/benchmark-sync.ts:164` starts a freshness check; `app/models/page.tsx:54`
  calls it.
- `lib/artificial-analysis.ts:16` reads `ARTIFICIAL_ANALYSIS_API_KEY`; the
  stored rows are intelligence/speed indices, not identity evidence.

The detail page every identity link needs does not exist either. The only public
model route is `app/models/page.tsx:47`; there is no `app/models/[id]` and no
catch-all. A repo-wide search for model identity terms returns only operations
incident fingerprints (`tests/operations.test.mjs:264`) and the load fixture
(`scripts/load/faults.mjs:381`), not a model-provenance subsystem.

### Expected Behavior

1. An operator opens `/admin/identity`, sees every free-pool model, its last
   run, its advisory state, and whether a result is published.
2. The operator starts a **baseline** run for one model or the free-pool set.
   The API returns a request/token/time/cost estimate before anything is sent,
   refuses a run that exceeds the configured caps, and refuses a paid model.
3. The worker calls the upstream directly with the provider credential from the
   environment. It does not use a customer key, the credit ledger, or the
   `/v1/chat/completions` admission path.
4. Every sample is persisted incrementally with a deterministic id, so a
   restart does not repeat paid work and a run can be inspected while it is
   still running.
5. The operator reviews the findings on the run detail page: protocol shape,
   determinism, canary leakage, the fingerprint comparison, deterministic
   canaries, context depth, tool conformance, stream integrity, and the
   conditional logprob result.
6. The operator publishes or unpublishes a verdict. Publishing is the only way
   a result becomes public. A publish or unpublish writes a dated correction
   ledger entry with the operator's note.
7. `/models/<public-id>` shows the model and a separate identity panel with the
   exact state, date, sample counts, supported claims, limits, and the advisory
   notice. A route with no trusted reference is `unsupported` or
   `self_consistent`, never `verified`.
8. If identity storage is unavailable or unconfigured, the catalog and the model
   page still render; the panel says the check is unavailable and makes no
   claim. The gateway admission path is untouched.

### Root Cause

The product was built around billing and catalog truth, not upstream identity.
The catalog's `ModelSummary` (`lib/types.ts:41`, projected by
`lib/projections.ts:213`) carries price, group, context, and feature flags; the
provider layer knows how to call an upstream (`lib/providers/openai.ts:7`,
`lib/providers/anthropic.ts:12`) but only as part of serving a customer
request. There is no protocol definition, no probe
battery, no evidence store, no reference registry, no verdict ladder, and no
public surface for an advisory result. The ten reference repositories live under
`resources/` as read-only research material; `resources/README.md` states the
licenses and the AGPL prohibition, and `.gitignore` excludes the folder.

### Evidence

```text
$ rg -n -i "fingerprint|identity verification|model identity" lib app components scripts tests
tests/operations.test.mjs:264:  assert.equal(active[0].fingerprint, "traffic:error_rate");
scripts/load/faults.mjs:381:        `SELECT fingerprint, delivery_state, delivery_attempts,
... (only operations incident fingerprints; no model-identity code)

$ rg --files app/models
app/models/opengraph-image.tsx
app/models/page.tsx
(no detail route, no catch-all)

$ rg -n "BenchmarkPanel|ensureBenchmarksFresh|ARTIFICIAL_ANALYSIS" app components lib
app/admin/(panel)/catalog/page.tsx:49:        <BenchmarkPanel status={getBenchmarkStatus(models.length)} />
components/admin/benchmark-panel.tsx:42:export function BenchmarkPanel({ status }: { status: BenchmarkStatus }) {
lib/artificial-analysis.ts:16:  return Boolean(process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim());
... (quality sync only; no route identity)

$ ls scripts
attribution-guard.mjs  business-model.mjs  db-backup.mjs  db-recovery-drill.mjs
db-restore.mjs  docker-entrypoint.sh  http-suite  http-suite.mjs
libsql-capability-spike.mjs  load  load-acceptance.mjs  operations-monitor.mjs
production-config-check.mjs  quality-report.mjs  render-images.mjs
sqlite-import.mjs  storage-contract-check.mjs  trial-http-suite.mjs
usdc-receive-spike.mjs
(no identity worker or probe runner)
```

The storage layer can host the evidence without touching SQLite:
`lib/storage/runtime.ts:50` returns a lazy Postgres handle, `lib/storage/database.ts:116`
creates it (PGlite locally, Postgres in production), and
`lib/storage/schema/index.ts:19` applies the additive schema inside one
transaction. The admin guard already exists (`lib/admin-auth.ts:51`), and the
navigation is a single array (`components/admin/admin-nav.tsx:6`).

## Impact Assessment

### Affected Components

- New: `lib/identity/*` (protocol, battery, statistics, probe client, store,
  runner, estimate, verdict, view, server adapter).
- New: `lib/storage/schema/identity.ts`, added to `lib/storage/schema/index.ts`.
- New: `app/admin/(panel)/identity/page.tsx` and `[id]/page.tsx`.
- New: `app/api/admin/identity/runs/route.ts` and `runs/[id]/route.ts`.
- New: `app/models/[...id]/page.tsx`, `app/identity/page.tsx`,
  `components/catalog/identity-panel.tsx`, `components/admin/identity-*.tsx`.
- Changed: `components/admin/admin-nav.tsx` (one nav item).
- Changed: `components/catalog/model-catalog-table.tsx` (model name links to
  the detail page).
- Changed: `.env.example` (identity switch and limits; names and comments only,
  no values).
- Changed: `lib/storage/schema/index.ts` (identity schema in the migration).
- Read-only reuse: `lib/providers/request.ts`,
  `lib/providers/anthropic-translate.ts`, `lib/model-identity.ts`,
  `lib/projections.ts`, `lib/pricing.ts`, `lib/admin-auth.ts`,
  `lib/request-limits.ts`, `lib/storage/runtime.ts`,
  `lib/storage/store/models.ts`, `lib/storage/store/providers.ts`.
  The customer-facing `lib/providers/openai.ts` and `lib/providers/anthropic.ts`
  adapters are not used: they call `providerFetch` directly and do not take an
  injected fetch.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The feature is high risk because it creates a public trust claim and spends
upstream quota. It is deliberately isolated from admission, credit, and
settlement, so a failure degrades the panel, not the gateway.

## Proposed Solution

### Approach

One lane, one evidence store, one operator gate:

```text
admin create ──► estimate + caps + free-only check
      │
      ▼
identity.runs (queued) ──► runner lease ──► probes ──► identity.samples
                                                   │
                                                   ▼
                                          identity.findings
                                                   │
                                                   ▼
                                          identity.verdicts
                                                   │
                              operator review ─────┤
                                                   ▼
                                    published projection
                                                   │
                                                   ▼
                                 /models/<id> + /identity
```

The runner talks to the upstream through the existing auth and translation
helpers with an injected fetch, not through the gateway's customer admission
path. It never writes to `usage_events`,
`credit_ledger`, `credit_holds`, `free_pool_*`, or any customer table, and it
never debits credit.

### Product contract

| Rule | Contract |
| --- | --- |
| Who runs it | An authenticated admin session. No public runner. |
| What runs first | Free-pool models (`access === "free"`) with an enabled, credentialed provider. Paid models are refused in this FID. |
| Who pays | The upstream free quota. The run is refused when the estimate exceeds the configured caps or the reported remaining quota with a 2× customer headroom. No credit debit. |
| What is measured | Protocol shape, determinism, canary leakage, response-distribution fingerprint, deterministic canaries, context retrieval, tool/schema conformance, stream integrity, and conditional logprobs. |
| What is not claimed | Authentic weights, unquantized execution, token-count conformance, absence of a hidden system prompt outside the canary probes, 100% detection, absence of substitution outside the tested probes, competitor accusations. |
| When it becomes public | Only when the operator publishes a completed run. Mismatch candidates are never auto-published. |
| What a customer sees | State, date, protocol, sample counts, supported claims, limits, advisory notice, and the correction ledger link. |
| What happens on a mismatch | The result is `divergent_review`; the operator reviews it. Confirmation writes a correction entry. The operator can disable the model with the existing catalog switch; there is no automated gate. |

### Protocol v2 and the battery

The protocol id is `aio-identity-v2` (version `2`). It is sealed by a SHA-256
hash over the canonical battery JSON (sorted keys), the exact system prompt,
the sampling parameters, the normalizer version, the smoothing constant,
the split-half seed and draw count, the bootstrap seed and draw count, and the
decision constants. The stored `battery_json` is the exact canonical string that
was hashed. A changed constant is a new protocol version; it cannot silently
reuse old references.

**Fingerprint cells (6).** Each cell is a fixed prompt with a fixed minimal
system message; `temperature: 1.0`, `top_p: 1.0`, `max_tokens: 1`, `n: 1`, no
seed. Twenty samples per cell per arm.

| Cell | Prompt |
| --- | --- |
| `fp-capital` | `The capital of France is` |
| `fp-arith` | `2 + 2 =` |
| `fp-opposite` | `The opposite of hot is` |
| `fp-code` | `def add(a, b):\n    return` |
| `fp-story` | `Once upon a time, there was a` |
| `fp-es` | `La capital de Francia es` |

System message: `You are a precise assistant.`

**Request budget per target arm.**

| Gate | Probes | Iterations | Requests | Notes |
| --- | --- | --- | --- | --- |
| Shape | 1 non-stream, 1 stream | 1 | 2 | Fail closed on a malformed response |
| Determinism | 6 prompts at T=0 | 3 | 18 | Exact agreement across repeats |
| Fingerprint | 6 cells at T=1.0 | 20 | 120 | The only arm that creates a reference |
| Canary | 6 prompts | 1 | 6 | System/user nonce, repetition, extraction |
| Deterministic canaries | 20 prompts | 1 | 20 | Exact-answer corroboration |
| Context | 2 needles × 3 depths | 1 | 6 | 819, 4,096, 8,192 tokens (or the advertised window if smaller) |
| Tools | 6 schemas | 1 | 6 | Only when `supportsTools` |
| Stream | 3 streams | 1 | 3 | One plain, one tool, one long |
| Logprobs | 6 cells | 2 | 12 | Only when the route returns top logprobs |
| **Total** | | | **175–193** | Tools/logprobs are conditional |

A **baseline** run executes the target arm and stores the 120 fingerprint counts
as a collected reference: 175–193 requests. A **verify** run executes the
target arm plus a 120-request different-model control when one is available:
295–313 requests, because the reference is already stored. A second-provider
reference is collected by a baseline run on that provider; the later verify run
compares against it without collecting it again. At the default 10 RPM that is
roughly 18 minutes for a baseline and 30 minutes for a verify, plus retries.

**Canary probes.** Each probe embeds a random 16-byte nonce in a system message
and asks for a verbatim repetition, a summary, or an instruction dump. The
finding is the maximum n-gram containment of the nonce in the response. Any
containment above zero is a leak; a refusal is `inconclusive`, not a pass.

**Canary limits.** The probe can prove leakage or instruction override when it
observes them. It cannot prove the absence of a hidden system prompt, and it
makes no tokenizer or prompt-token claim. That limit is printed with the
finding and is part of the methodology page.

**Context.** The advertised window is parsed by a new `parseContextWindow`
(`128K`, `200K`, `1M`, bare integers, comma-separated integers). If it cannot be
parsed, the gate is `not_tested`. The tested ceiling is 8,192 tokens and the
ladder is 819, 4,096, 8,192 (or the advertised window when it is smaller). The
claim is "passed at N tokens of the advertised window, tested up to 8,192",
never "supports the advertised window" beyond the tested depth. A failure at a
deeper probe is a truncation signal only when the same needle passed at a
shallower depth.

**Tools.** Six schemas: a nested object, an array of objects, an enum, a
required field, a package-command echo (`npm install <typosquat>`) and a
no-extra-properties schema. Any malformed call, rewritten command, or phantom
tool is a finding. A route that rejects the `tools` parameter is `not_tested`,
not a failure.

**Stream.** Three streams: plain text, one with a tool call, and one long
completion. Invariants: SSE event types are from the protocol whitelist, usage
is monotonic and internally consistent, the terminal `[DONE]` (or Anthropic
`message_stop`) appears exactly once, no events follow the terminal event, and
the `model` field does not change mid-stream.

**Logprobs.** Conditional. If the route returns top-k logprobs, record them and
compare top-1 agreement with the reference counts. The top-k distribution is
reported descriptively; phase 1 stores no top-k reference, so no cross-route
top-k JSD is claimed. If the route returns no logprobs, the gate is `not_tested`;
no quantization claim is made either way.

### Statistical rules

No composite score. Each finding is orthogonal and published separately.

**Fingerprint comparison.** For each cell with at least 10 valid samples on both
sides, compute the Jensen-Shannon divergence (base 2) between the target and
reference count distributions, with additive smoothing. Report the mean over
comparable cells and a bootstrap 95% confidence interval over cells. The
reference's own split-half distribution supplies the noise floor:

- Split each side's valid samples into two halves as evenly as possible, 50
  times; with the 20-sample reference the halves are 10 and 10. Compute the
  95th percentile of the per-cell JSD, `q95_ref`; the same procedure on the
  target gives `q95_target`.
- `noise = max(q95_ref, q95_target, 0.01)`.
- `consistent` when the mean JSD's 95% upper bound is `<= 1.5 × noise` and at
  least 4 cells are comparable.
- `divergent` when the mean JSD's 95% lower bound is `> 3 × noise` and at least
  4 cells are comparable.
- Otherwise `inconclusive`.

The multipliers 1.5 and 3 are sealed protocol constants, not universal JSD
thresholds. They are replaced by a calibration certificate in a later protocol;
this FID does not claim a calibrated false-positive rate. A true cross-provider
pair can still land in `inconclusive` under this uncalibrated rule, because the
paper's cross-provider band is wider than the same-route noise. The panel says
so rather than promoting the pair to `consistent`; the calibration lane is what
narrows that band with measured data.

**Reference identity.** A reference collected from the target's own provider
can only produce `self_consistent`; the public copy says the route is stable
against its own baseline and identity is not independently verified.
`consistent` requires a reference collected from a different provider for the
same `canonicalModelKey` under the same protocol, plus a different-model
control. Without a control, the run falls back to a same-provider reference and
can only be `self_consistent`. The reference provider and the target provider
are compared at verdict time; there is no separate source flag that could
disagree with the data. The hash covers the canonical reference object
(canonical model key, protocol id, provider slug, upstream id, collected_at,
`n_per_cell`, and counts), not just the counts, and the stored `counts_json` is
the exact canonical string that was hashed. The selector recomputes it and
refuses a reference whose hash does not match. The hash detects corruption and
accidental mismatch, not a compromised database role; phase 1 makes no
tamper-proof claim. References expire after 7 days; an expired reference makes
the run `stale`.

**Determinism.** At T=0, 3 repeats of 6 prompts must agree after the normalizer
(trim and collapse whitespace; the normalizer version is in the protocol hash).
Any disagreement marks the route `unstable`; the fingerprint comparison is then
`inconclusive`, because the route cannot support a distribution claim.

**Deterministic canaries.** Report `passed / 20` with a Wilson 95% interval.
This is corroboration, not a verdict. A low rate is a quality signal; it does
not prove substitution.

**Multiple models.** Each model is an independent advisory result. No
catalog-wide significance claim is made, and no Benjamini-Hochberg procedure is
applied because no public "significant mismatch" count is published. A
`divergent` result is reviewed by the operator before any public text calls it a
mismatch.

**Cache/replay screen.** Report per-cell modal share and entropy. If every cell
is a single repeated token and the reference has positive entropy, mark
`replay_suspect` as a descriptive finding. Do not turn it into a verdict in
protocol v2.

### Verdict ladder

| Status | Meaning | Public copy (exact) |
| --- | --- | --- |
| `baseline` | A baseline distribution exists; no comparison yet. | "A response baseline was collected on {date}. No protocol-matched reference has been compared yet, so model identity is not independently verified." |
| `self_consistent` | Compared with the same route's stored baseline. | "The route's response distribution was stable against its own stored baseline on {n} probe cells ({samples} samples per cell), tested {date}. This does not independently verify the model identity." |
| `consistent` | Compared with a second-provider reference and a different-model control. | "Behavioral response distributions were consistent with the stored second-provider reference on {n} probe cells, tested {date}. This is an advisory result, not a guarantee of model weights." |
| `inconclusive` | Coverage, stability, or controls were insufficient. | "The check did not produce a conclusive result: {reason}. No identity claim is made." |
| `divergent_review` | The measured effect exceeded the noise rule; operator review is pending. | "A difference from the stored reference was measured on {date}. It is under operator review and is not a finding." |
| `mismatch_confirmed` | The operator confirmed a mismatch. | "The operator confirmed a mismatch on {date}. See the correction ledger." |
| `unsupported` | No trusted reference and no baseline. | "No trusted reference or baseline exists for this route. Identity is not testable." |
| `stale` | The last consistency result is older than the TTL. | "The last check is older than {days} days. The previous result is no longer current." |
| `error` | The run failed before a verdict. | "The last check failed. No current identity result is available." |

Public integrity findings use the same discipline: "No canary leakage was
detected in {k} probes; this does not prove the absence of a hidden system
prompt"; "Context retrieval passed at {n} tokens of {advertised} advertised
(tested up to 8,192)"; "Streaming protocol invariants passed on {k} streams";
"Tool calls conformed on {k} schemas." A `not_tested` gate is shown as "not
tested", never as a pass. The words `authentic`,
`genuine`, `proven`, `certified`, `unquantized`, `100%`, and any competitor name
are prohibited in the public panel; a unit test asserts their absence from the
generated copy.

### Storage schema

A dedicated `identity` schema in the same Postgres database. It has no foreign
keys or joins to billing or customer tables. Phase 1 uses the application
connection; least-privilege role separation is not claimed. The schema is
created by a new `lib/storage/schema/identity.ts`, called from
`applySchema` after `billingSchema`.

```sql
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.protocols (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  probe_sha256 TEXT NOT NULL,
  system_prompt_sha256 TEXT NOT NULL,
  battery_json TEXT NOT NULL,
  sampling_json TEXT NOT NULL,
  normalizer_version TEXT NOT NULL,
  sealed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity.references (
  id TEXT PRIMARY KEY,
  canonical_model_key TEXT NOT NULL,
  protocol_id TEXT NOT NULL REFERENCES identity.protocols(id),
  provider_slug TEXT NOT NULL,
  upstream_id TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  n_per_cell INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  run_id TEXT
);
CREATE INDEX IF NOT EXISTS identity_references_match_idx
  ON identity.references(canonical_model_key, protocol_id, expires_at);

CREATE TABLE IF NOT EXISTS identity.runs (
  id TEXT PRIMARY KEY,
  target_model_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  canonical_model_key TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  upstream_id TEXT NOT NULL,
  target_json TEXT NOT NULL,
  provider_json TEXT NOT NULL,
  protocol_id TEXT NOT NULL REFERENCES identity.protocols(id),
  reference_id TEXT REFERENCES identity.references(id),
  control_model_id TEXT,
  control_provider_slug TEXT,
  control_upstream_id TEXT,
  control_json TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('baseline','verify')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled','interrupted')),
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  estimate_json TEXT NOT NULL,
  actual_json TEXT,
  coverage_json TEXT,
  error_class TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_runs_active_target_idx
  ON identity.runs(target_model_id)
  WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS identity.samples (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
  probe_id TEXT NOT NULL,
  arm TEXT NOT NULL CHECK (arm IN ('target','diff_control')),
  iteration INTEGER NOT NULL,
  http_status INTEGER NOT NULL,
  model_field TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  response_sha256 TEXT NOT NULL,
  response_excerpt TEXT NOT NULL,
  top_logprobs_json TEXT,
  latency_ms INTEGER,
  error_class TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_samples_key_idx
  ON identity.samples(run_id, probe_id, arm, iteration);
CREATE INDEX IF NOT EXISTS identity_samples_run_idx
  ON identity.samples(run_id, arm);

CREATE TABLE IF NOT EXISTS identity.findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
  class TEXT NOT NULL,
  metric TEXT NOT NULL,
  observed TEXT,
  threshold TEXT,
  n INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pass','fail','inconclusive','not_tested','suspect')),
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_findings_key_idx
  ON identity.findings(run_id, class, metric);

CREATE TABLE IF NOT EXISTS identity.verdicts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES identity.runs(id) ON DELETE CASCADE,
  target_model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('baseline','self_consistent','consistent','inconclusive','divergent_review','mismatch_confirmed','unsupported','stale','error')),
  summary TEXT NOT NULL,
  claims_json TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL,
  tested_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_verdicts_public_idx
  ON identity.verdicts(target_model_id, published, tested_at DESC);

CREATE TABLE IF NOT EXISTS identity.corrections (
  id TEXT PRIMARY KEY,
  target_model_id TEXT NOT NULL,
  run_id TEXT,
  status_before TEXT,
  status_after TEXT,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  operator_note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_corrections_model_idx
  ON identity.corrections(target_model_id, created_at DESC);
```

The migration is additive and idempotent. `identity.runs.reference_id` and the
`control_*` columns are references within the identity schema, not to catalogs. The `counts_json` reference shape is
`{ "cells": { "fp-capital": { "n": 20, "counts": { "Paris": 14, ... } } } }`;
a reference is created only from a completed baseline target arm. Responses are
stored as a SHA-256 plus a redacted 160-character excerpt; headers, keys, and
customer prompts are never stored. Samples older than 90 days are deleted at
the start of a run creation; runs, findings, verdicts, references, and
corrections stay until superseded.

### Runner lifecycle

1. **Create.** The admin route reads the ported catalog and provider stores
   through the same Postgres handle the identity store uses: `listAllModels(db)`
   from `lib/storage/store/models.ts` and `listProviderRecords(db)` from
   `lib/storage/store/providers.ts`. For each selected model it resolves the
   **serving route** with `getModelForGateway(db, modelId)`, because the admin
   row's `upstreamSlug` and `protocol` describe the row's own provider, not the
   provider that answers the public id. The target snapshot combines the gateway
   model (public id, upstream slug, upstream id, protocol, access, context
   window, token weight, serving cost) with `supportsTools` from the admin
   summary, and is stored in `target_json`; the provider identity (`slug`,
   `kind`, `baseUrl`, `keyEnvVar`) goes in `provider_json`, and the control
   target plus provider identity in `control_json`. It calls `ensureProtocol`
   before the insert; that helper refuses a stored row whose battery hash
   differs from the current protocol (409), so a changed battery cannot silently
   reuse `aio-identity-v2`. The insert would fail with a foreign-key violation
   without that row. It then selects the newest unexpired reference (preferring a
   different provider only when a control is available) and stores
   `reference_id`, computes the estimate, applies the caps and the free-only
   rule, checks the provider key and reported remaining quota, sweeps stale
   `running` rows older than two hours to `interrupted`, and inserts a `queued`
   run. `dryRun` returns the estimate without inserting and does not need the
   protocol row. No secret is written; `keyEnvVar` is a name and the value is
   read from the environment at execution time.
2. **Start.** The route calls `void executeRun(db, runId, deps)` after the
   response. `executeRun` atomically claims the row with an update that returns
   the id (`db.query` or `prepare().get`; the adapter's `run()` exposes only
   the change count). It resolves the live provider through the injected
   resolver
   (the creation-time `provider_json` is the audit snapshot; default headers
   are never persisted), and uses the injected fetch, header builder, clock,
   sleep, and random source. If the
   process dies before the claim, the run stays `queued` and the admin page
   offers Start again; if it dies after the claim, the stale sweep marks it
   `interrupted`.
   The app is a long-lived Node process on Fly; the FID records that this is the
   deployment assumption. A future process split is a separate record.
3. **Seal.** The runner re-verifies the protocol hash inserted at creation. A
   mismatch fails the run before any probe is sent.
4. **Shape.** One non-stream and one stream request. A malformed envelope fails
   the run with `shape_failed`; no further quota is spent.
5. **Gates.** Determinism, canary, fingerprint target arm, deterministic
   canaries, context, tools, stream, logprobs. Each gate writes its samples and
   one finding as it completes. The fingerprint target counts become the
   collected reference when the run is a baseline or when no reference exists.
6. **Reference.** A verify run re-validates the reference stored at creation
   against the protocol, TTL, and content hash. If it expired or no longer
   matches, the runner re-selects from the current rows, preferring a
   different-provider reference only when the run has a control; without a
   control it falls back to a same-provider reference and can only reach
   `self_consistent`. If no reference exists, the run is a baseline and its
   verdict is `baseline`, not a failed verification. The run records whether
   the reference was same-provider or second-provider in `coverage_json`.
7. **Control.** The create step picks a different free model under the same
   protocol, resolves its serving route with `getModelForGateway`, and stores
   that snapshot on the run; a provider with no configured key is not available
   as a control. When a second-provider
   reference exists but the control is missing, the verdict is `inconclusive`
   with `control_missing`; a same-provider comparison can still be
   `self_consistent`. The control is discriminative only when the target-to-
   control mean JSD is at least `2 × noise` larger than the target-to-reference
   mean JSD; otherwise the verdict is `inconclusive` with
   `control_not_discriminative`. A missing control never fabricates a pass.
8. **Verdict.** Compute the findings and the ladder status, insert the verdict
   with `published = 0` and `valid_until = tested_at + 7 days` (the same TTL as
   the reference), and mark the run `completed`. On a retryable error
   budget exhaustion, mark `failed` with `error_class` and insert an `error`
   verdict with `published = 0` so a failed check can replace a stale public
   state if the operator chooses to publish it. On a cancellation request
   between requests, mark `cancelled`. On a process restart, the stale sweep
   marks the old row `interrupted`; samples stay.
9. **Publish.** `PATCH /api/admin/identity/runs/[id]` with
   `{ action: "start" | "publish" | "unpublish" | "cancel" | "confirm_mismatch", note?: string }`.
   `start` re-runs a `queued` row and is idempotent through the status claim.
   Publish requires a completed run, a verdict, and the model still present and
   enabled in the live catalog. A consistency verdict (`baseline`,
   `self_consistent`, `consistent`) must have `valid_until` in the future; an
   expired one must be re-run. A `mismatch_confirmed` verdict is a dated finding
   and is publishable regardless of TTL; a `divergent_review` is publishable
   while it is under review. Unpublish requires a note and writes a
   correction row. `confirm_mismatch` requires a `divergent_review` verdict and
   a note; it changes the verdict to `mismatch_confirmed` and writes a
   correction row. Publication is a separate step, so confirmation never
   publishes itself. The route is guarded by `guardAdminApi` and returns
   `NO_STORE`.

The deployment has one operator identity. `published_by` records `operator`,
and the note plus the timestamp are the audit trail; there is no per-user admin
identity to record.

**Probe seam.** The probe client uses the injected provider resolver, fetch,
and header builder, and stays free of `server-only` imports so the Node test
runner can load it. The server adapter (`lib/identity/server-deps.ts`) supplies
the live provider record and `providerHeaders` from
`lib/providers/request.ts`. For Anthropic-protocol targets it translates the
request with `toAnthropicRequest` and normalizes the response with
`toOpenAiCompletion` from `lib/providers/anthropic-translate.ts`; both wire
formats then feed the same evidence code. The existing customer-facing adapters
are not used, because they do not accept an injected fetch and they belong to
the admission path.

**Idempotency and retries.** A sample id is
`${runId}:${probeId}:${arm}:${iteration}`; inserts use `ON CONFLICT DO NOTHING`.
Findings upsert on `(run_id, class, metric)` and the verdict upserts on
`run_id`, so a resumed run does not violate its own unique keys. A retry reuses
the same sample id, so a crash after the upstream response but before the
insert can repeat at most one request. Retry only 408, 425, 429, 500, 502,
503, 504, timeouts, and network errors; honor `Retry-After` up to 60 seconds;
maximum 3 attempts with 1s/4s/9s backoff. A 401/403 aborts the run immediately.
A 400/404/422 on a gate marks that gate `not_tested` or fails the shape gate; it
is never retried into a false pass.

**Rate and quota.** A single global limiter sleeps `60_000 / rpm` between
requests; `IDENTITY_RPM` defaults to 10 and is capped at 60. Batches run models
sequentially; there is no concurrent-request switch. Preflight
refuses when the provider reports `subscriptionTokensRemaining <
estimate.weightedTokens * 2`. If the provider reports no remaining quota, the
run is allowed with the hard request cap and `quota_check: "unknown"` recorded
in the estimate. `IDENTITY_MAX_REQUESTS_PER_MODEL` defaults to 600 and
`IDENTITY_MAX_REQUESTS_PER_BATCH` to 3,000. The batch cap is deliberately below
one verify pass over eleven models (about 3,400 requests), so the free-pool set
is split across batches and the admin form shows the split before creating
anything. `IDENTITY_SAMPLE_RETENTION_DAYS` defaults to 90. `IDENTITY_ENABLED`
must be `true`; otherwise creation returns 503 and the admin page shows the
switch.

### Estimation

The estimate is computed from the battery, not guessed from the catalog:

- Requests: the exact per-gate counts above, plus a 20% retry allowance,
  rounded up. A verify run adds the 120-request different-model control when
  the create step found one.
- Prompt tokens: `fingerprint 1,440 + determinism 540 + canary 240 +
  deterministic 600 + context 26,214 + tools 900 + stream 600 + logprobs 144`,
  then +20%. That is 30,678 before headroom and about 36,814 after for a
  baseline; a verify with a control adds the control's 1,440 fingerprint
  prompt tokens. Context is the dominant term and is capped at 8,192 tokens.
- Completion tokens: `fingerprint 120 + determinism 144 + canary 120 +
  deterministic 80 + context 24 + tools 480 + stream 300 + logprobs 12`, then
  +20%.
- Upstream cost micros: `round(promptTokens * costInputMicros / 1_000_000 +
  completionTokens * costOutputMicros / 1_000_000)`. The admin summary exposes
  `costInputPer1M` and `costOutputPer1M` in dollars per 1M, so the route
  multiplies each by 1,000,000 before applying the formula; free models are 0.
  This is an estimate, not a charge.
- Weighted tokens: `promptTokens + completionTokens * max(1, tokenWeight)`.
- Time: `requests / rpm` minutes, plus 20%.
- The response includes `requests`, `promptTokens`, `completionTokens`,
  `costMicros`, `weightedTokens`, `minutes`, `quotaRemaining`,
  `quotaCheck`, and `refusals[]`. A refusal is a 409 with the exact reason.

### API and UI

| Surface | Behavior |
| --- | --- |
| `/admin/identity` | Server component. Reads the live catalog and provider records plus the identity store. Renders coverage, last run, verdict state, published flag, and the create form. The read sweeps `running` rows older than two hours to `interrupted`. If `getDatabase()` throws, renders "Identity storage is not configured" with the exact missing setting; no run button. |
| `/admin/identity/[id]` | Server component with polling client. Shows target snapshot, protocol, status, estimate vs actual, coverage, findings, sample counts, error class, start/publish/unpublish/cancel/confirm-mismatch controls, and the correction note field. |
| `POST /api/admin/identity/runs` | `{ modelIds: string[], mode: "baseline"\|"verify", dryRun?: boolean }`. 202 with run ids and estimate; `dryRun` returns 200 with the estimate and no run ids; 400 invalid; 401/403 guard; 409 active run, cap, paid model, or quota; 503 disabled or storage unconfigured. |
| `PATCH /api/admin/identity/runs/[id]` | `{ action: "start"\|"publish"\|"unpublish"\|"cancel"\|"confirm_mismatch", note? }`. 200 with the updated run/verdict; 400 invalid action or missing note; 404 unknown; 409 wrong run state, expired consistency verdict, model gone, not publishable, or not a reviewable mismatch. |
| `/models/[...id]` | Public detail. Catch-all because public ids contain `/` (`free/gpt-6-luna`). `notFound()` when absent. Identity read is wrapped; a failure renders the unavailable panel, never a 500. The read picks the published verdict with the greatest `tested_at` and applies `valid_until` only to the consistency states (`baseline`, `self_consistent`, `consistent`): past the TTL they render `stale`. A `mismatch_confirmed` verdict stays visible with its date, and a `divergent_review` stays under review; neither is rewritten to `stale`, because a dated finding is not a current consistency claim. |
| `/identity` | Public methodology and correction ledger. Static method text plus the last 20 corrections; a ledger read failure shows "ledger unavailable". The ledger renders the model, statuses, date, and sanitized note, never `evidence_json`. |
| Catalog | The model name links to `/models/<encoded segments>`. No column is added; the table stays readable. |

A batch is validated end to end before the first row is inserted, so a mixed
batch (one paid model, one unknown id, one over-cap) does not leave half-created
runs. A `verify` dry-run with no protocol-matched reference says it will be a
baseline and does not price a control; the run still records the requested mode
for the audit. The public panel is a server component; it receives the verdict and
findings as plain data. It does not fetch the admin API, and it never exposes
JSD values, e-values, raw samples, or control internals. Those stay on the admin
run page.

### Implementation steps

1. Pure core: `protocol.ts`, `battery.ts`, `normalize.ts`, `context-window.ts`,
   `stats/jsd.ts`, `stats/intervals.ts`, `stats/split-half.ts`, `estimate.ts`,
   `verdict.ts`, `view.ts`, and their unit tests. No storage, no network.
2. Storage: `lib/storage/schema/identity.ts`, `store.ts`, and
   `tests/identity-store.test.mjs` (PGlite: migration, protocol sealing, run
   lifecycle, sample idempotency, reference selection and expiry,
   publish/unpublish, corrections, and the published read).
3. Probe client: `probe-client.ts` with both wire protocols, the injected
   provider resolver, fetch, and header builder, the rate limiter, the
   retry/error taxonomy, redaction, and the estimate handoff. Tested against a
   fake fetch in `tests/identity-probe-client.test.mjs`.
4. Runner: `gates.ts` and `runner.ts`, including the status claim, control
   selection, cancellation, stale recovery, coverage, and the verdict write.
   Tested against a fixture upstream with injected clock and sleep.
5. Admin API: the guarded create/dry-run route and the action route, with the
   exact validation and status codes above.
6. Admin console: `/admin/identity`, `/admin/identity/[id]`, the polling client,
   the coverage table, the start/publish/unpublish/cancel/confirm controls, and
   the nav entry.
7. Public surface: `/models/[...id]`, `IdentityPanel`, `/identity`, the
   correction ledger, and the catalog name link. The copy comes only from
   `view.ts`.
8. Operation: the free-only rule, the caps, the quota headroom, the failure
   isolation, and the disposable-database HTTP receipt against a fixture
   upstream.
9. Closure: the declared gates, the verification receipt, the commit, the
   CHANGELOG entry, and the move to `dev/fids/archive/`.

### Security and redaction

- Credentials come from `process.env[provider.keyEnvVar]` through
  `providerHeaders`; the key is never persisted, logged, or returned.
  `provider_json` stores only the registry identity fields (`slug`, `kind`,
  `baseUrl`, `keyEnvVar`); default headers and every credential are never
  persisted. The pure runner and probe client have no `server-only` import; the
  server adapter is the only place that reads the credential and builds
  headers.
- No request headers are stored. Error bodies are truncated to 200 characters
  and stripped of control characters. The probe fetch sets `redirect:
  "error"`, `cache: "no-store"`, and a per-request timeout, so an
  operator-configured origin cannot bounce the credential to another host or
  answer from a cache.
- Response excerpts are 160 characters, redacted, and synthetic; the full body
  is represented by a SHA-256 of the normalized response.
- The identity schema has no foreign keys to billing, customers, keys, or
  catalog tables. The runner has no import of the credit, settlement, or
  customer modules.
- The admin routes use `guardAdminApi` and `NO_STORE`; the public page is
  read-only and server-rendered.
- The AGPL reference project contributes no code. The origin register in
  `docs/research/aio-source-review.md` Appendix B is the attribution record; no
  per-file header is added.

## Verification

The implementation is verified by the declared gates plus a focused live
receipt:

1. `tests/identity-stats.test.mjs`, `tests/identity-protocol.test.mjs`,
   `tests/identity-estimate.test.mjs`, and `tests/identity-view.test.mjs`: JSD,
   smoothing, Wilson intervals, split-half noise, the protocol hash,
   normalization, context parsing, the estimate, the verdict ladder, and the
   public copy.
2. `tests/identity-store.test.mjs` PGlite integration tests for the migration,
   protocol sealing, run lifecycle, sample idempotency, reference selection and
   expiry, publish/unpublish and correction rows, and the published read.
3. `tests/identity-runner.test.mjs` and
   `tests/identity-probe-client.test.mjs` with an injected provider resolver,
   fetch, header builder, and clock: baseline, same-route verify,
   second-provider verify, divergent review, unstable route, shape failure,
   auth abort, retry budget, cancellation, resume after a partial run, and
   quota refusal.
4. A run/publish receipt under `next dev` with PGlite, which is the local
   runtime: a dry-run estimate, a baseline run against a fixture upstream,
   publish, and the public panel. A production-build receipt covers `/models`,
   `/models/<free-id>`, `/identity`, and the explicit "identity storage not
   configured" state, because the production runtime refuses PGlite. If a
   disposable Postgres is available, the run/publish receipt runs against it
   instead. The receipt records the commands and the observed output; a green
   build alone is not evidence.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/identity-stats.test.mjs
- gate: test tests/identity-protocol.test.mjs
- gate: test tests/identity-estimate.test.mjs
- gate: test tests/identity-store.test.mjs
- gate: test tests/identity-runner.test.mjs
- gate: test tests/identity-probe-client.test.mjs
- gate: test tests/identity-view.test.mjs
- gate: test
- gate: quality
- gate: build

`npm run verify` is not a declared gate for this record. It currently exits 1
before the identity surface is reached because FID-086's storage flip is
incomplete: `npm run test:http` starts `next start` with SQLite only, the first
converted admin route asks for `DATABASE_URL`, and the suite stops at `promo
admin list serves — expected 200, got 401` with `DATABASE_URL is required in
production. The local storage engine is a single-process database and is not a
production fallback.` The feature gates above and the focused live receipt below
pass. The whole-repo gate is recorded as a limitation, not a pass.

### Verification Receipt

Recorded 2026-11-01 on `main` with Node 24.21.0 and npm 11, after commit
`ffcb8b2`.

| Command | Exit | Observed |
| --- | --- | --- |
| `npm run lint` | 0 | no output; zero errors, zero warnings |
| `npm run typecheck` | 0 | no output |
| `node --test tests/identity-*.test.mjs` | 0 | 66 tests, 66 pass, 0 fail |
| `npm test` | 0 | 748 tests, 747 pass, 0 fail, 1 skipped (existing conditional) |
| `npm run quality` | 0 | `PASS (400-line ceiling, 512 files scanned)` |
| `npm run build` | 0 | route table includes `/identity`, `/models/[...id]`, `/admin/identity`, `/admin/identity/[id]`, and both identity API routes |
| `npm run test:recovery` | 0 | 13 PASS (dump, restore, replay and refusals) |
| `npm run test:http` | 1 | `promo admin list serves — expected 200, got 401`; server log `DATABASE_URL is required in production...` (FID-086 cutover incomplete) |
| `npm run verify` | 1 | same HTTP failure; lint, typecheck, unit tests, quality and build passed first, and the recovery drill passes separately |

**Live admin receipt.** Under `next dev` on port 3010 with PGlite and a local
OpenAI-compatible fixture upstream:

- dry-run: 232 requests, 36,814 prompt tokens, 1,536 completion tokens, 4.6
  minutes, `quota_check: "unknown"`, cost $0.00.
- baseline run `6c0506b6-375a-4572-ae06-53152e1fb9ab`, completed in 3 minutes:
  181 samples, 36,673 prompt tokens, 181 completion tokens. Coverage: shape 2,
  determinism 18, canary 6, deterministic 20, context 6, tools 6, stream 3,
  logprobs 0 (not tested), fingerprint 0 comparable cells (no reference yet).
- publish: verdict `baseline`, `published: 1`, `publishedBy: operator`, summary
  `A response baseline was collected on 2026-11-01. No protocol-matched
  reference has been compared yet, so model identity is not independently
  verified.`
- public `/models/free/fixture-model`: 200; the `Model identity` panel shows
  `Baseline collected`, the tested/valid-until dates, the supported claim and
  both limits; it does not claim model weights.
- `/identity`: 200; method copy and the empty correction ledger.

Two infrastructure defects were found by the receipt. PGlite needed
`serverExternalPackages` so a React Server Component loads it from Node instead
of a Turbopack module URL. Next's RSC and route bundles also created separate
PGlite engines on one directory, so the handle is cached on `globalThis`; the
admin page's polling then stopped blocking the runner's sample writes. The HTTP
gate additionally exposed the account page reading policy acceptance from the
ported PostgreSQL façade while signup and the account acceptance route still
write SQLite; the page now reads the same lane until FID-086's flip, and no
customer is asked to accept a policy they already accepted.

## Perfection Loop

### Loop 1 — RED

- **RED:** The first draft copied the research report's ladder too literally.
  It planned `/models/[id]`, a fixed JSD threshold, a tokenizer-conformance
  gate, and a "verified" public state. It also assumed the Postgres cutover had
  landed and that a fire-and-forget runner would survive a deploy.
- **GREEN:** Replaced the detail route with a catch-all because public ids
  contain `/` (measured in FID-2026-1029-003, finding F2: `free/*` ids broke the
  planned `[id]` API route). Replaced fixed JSD thresholds with the reference's
  own split-half noise envelope and removed the word "verified" from the public
  ladder. Dropped the tokenizer gate and the prompt-token claim entirely,
  because no local tokenizer dependency exists and `characters / 4` is
  explicitly prohibited; the canary probe now claims only what it observes.
  Made the identity store use the ported Postgres handle (PGlite locally)
  without touching SQLite, and documented the production `DATABASE_URL`
  dependency. Added the DB lease, deterministic sample ids, stale-run sweep,
  and `interrupted` state.
- **AUDIT:** Re-read `lib/storage/runtime.ts`, `lib/storage/schema/index.ts`,
  `lib/storage/pg-adapter.ts`, `lib/providers/request.ts`,
  `lib/providers/openai.ts`, `lib/providers/anthropic.ts`,
  `lib/model-routing.ts`, `lib/projections.ts`, `lib/admin-auth.ts`, and
  `components/admin/admin-nav.tsx`. The proposed imports exist; the migration
  is additive; the admin guard is callable from a route handler; the catch-all
  route matches the id shape.
- **ADVERSARIAL:** A same-route baseline is not identity evidence. If the panel
  calls it "consistent," the product repeats the exact overclaim it exists to
  prevent. The ladder was split into `baseline` and `self_consistent`, and
  `consistent` now requires a reference collected from a different provider
  plus a different-model control. The public copy was rewritten to say "does
  not independently verify the model identity."
- **CHANGE DELTA:** Approximately 18% of the draft.

### Missed Questions

1. **What is the reference key when the same model has several public ids?**
   `canonicalModelKey(upstreamId)` from `lib/model-identity.ts`, not the public
   id. The run stores both; the reference matches the canonical key.
2. **What if the route does not support the system role?** The protocol requires
   it. A route that rejects it is `unsupported` under protocol v2; the runner
   does not silently prepend the system message, because that would change the
   protocol and invalidate the reference.
3. **What if `max_tokens: 1` is rejected?** The shape gate records the error and
   the run is `inconclusive`/`error`; no fingerprint is collected under a
   different decoding regime.
4. **What if the provider never honors temperature 0?** Determinism fails and
   the fingerprint is `inconclusive`. That is a real, useful result about the
   route, not a reason to lower the bar.
5. **What if the model is free but the provider key is absent?** The model is
   listed as `unconfigured`; it cannot be selected. No request is attempted.
6. **What if two runs are created at once?** The partial unique index on active
   runs per target returns 409 for the second; the UI disables the button while
   a run is active.
7. **What if the process restarts mid-run?** Samples are durable and keyed; the
   stale sweep marks the row `interrupted`; a new run skips existing sample ids
   only if it is the same run id. A new run id re-collects, which is honest
   because the run is a new observation.
8. **What if the catalog changes while a run is in flight?** The run uses its
   target snapshot. Publishing re-checks the live model; a missing or disabled
   model refuses publication.
9. **What if the context window is unparseable?** `parseContextWindow` returns
   null; the context gate is `not_tested`; no claim is made.
10. **What if a stream lacks a terminal event?** The stream finding is `fail`;
    the verdict can still be `inconclusive` or `consistent` on the fingerprint,
    because stream integrity is a separate claim.
11. **What if the free quota is already exhausted?** Preflight refuses with the
    reported remaining and the estimate. If the provider reports nothing, the
    request cap is the only guard; the estimate records `quota_check: unknown`.
12. **What if the operator publishes a baseline and later a verify run?** The
    public panel shows the newest published verdict; the older verdict remains
    in the ledger. The correction table records the change when the operator
    unpublishes or replaces it with a note.
13. **What if identity storage is down?** The catalog and model page catch the
    read error and render an unavailable panel. The admin page shows the
    configuration error. No request path imports the identity store.
14. **What if a competitor is named in an operator note?** The public correction
    ledger renders the operator's note; the copy test only guards generated
    strings. The admin form tells the operator not to name competitors; a
    server-side `sanitizePublicNote` rejects the known prohibited terms and
    returns 400. The public ledger applies the same sanitizer on render, so a
    row written before the rule cannot bypass it.

### Implementation Evidence

- [x] **Commit SHA:** `ffcb8b2` (`feat(identity): add admin-run model identity
  verification (FID-2026-1101-087)`). The commit also carries the PostgreSQL
  storage handle and schema this lane depends on.
- [x] **File:line ranges:** `lib/identity/protocol.ts:42` (`protocolSeal`),
  `lib/identity/battery.ts:300` (`BATTERY`), `lib/identity/estimate.ts:31`
  (`estimateRun`), `lib/identity/verdict.ts:49` (`decideVerdict`),
  `lib/identity/view.ts:198` (`publishedView`),
  `lib/identity/runner.ts:71` (`executeRun`),
  `lib/identity/store/runs.ts:14` (`insertRun`),
  `lib/identity/store/verdicts.ts:163` (`publishVerdict`),
  `lib/storage/schema/identity.ts:1-146`,
  `app/api/admin/identity/runs/route.ts:1-99`,
  `app/api/admin/identity/runs/[id]/route.ts:1-85`,
  `app/admin/(panel)/identity/page.tsx:1-251`,
  `app/admin/(panel)/identity/[id]/page.tsx:1-63`,
  `app/models/[...id]/page.tsx:1-213`, `app/identity/page.tsx:1-287`,
  `components/identity/identity-panel.tsx:17`.
- [x] **Gate output:** the receipt above; 66 identity tests, 748 repository
  tests, lint, typecheck, quality, build and recovery pass. The HTTP/verify gate
  fails at FID-086's cutover and is stated as a limitation.
- [x] **Reproducibility:** the public and admin call graph is present:
  `components/admin/admin-nav.tsx:10` links `/admin/identity`;
  `components/admin/identity-console.tsx:137` posts `/api/admin/identity/runs`;
  `components/admin/identity-run.tsx:49` patches
  `/api/admin/identity/runs/[id]`; `app/models/[...id]/page.tsx:7` imports
  `IdentityPanel`; `components/catalog/model-catalog-table.tsx:258` links each
  catalog name to `/models/<encoded segments>`.
- [x] **Implementation steps:** 1-7 implemented (core, storage, probe client,
  runner, admin API, admin console, public surface); 8 implemented (free-only
  rule, caps, quota headroom, failure isolation, live fixture receipt); 9
  complete with this record, the commit, the CHANGELOG entry and the archive
  move.

### Code Verification Evidence

- [x] Referenced files exist and were read 0-EOF before implementation.
- [x] Implementation matches the Proposed Solution: the battery is sealed by
  `protocolSeal`, the estimator shares `BATTERY`, the verdict ladder is
  orthogonal, publishing is an explicit operator action, and the public copy
  comes only from `view.ts`.
- [x] Typecheck, lint, identity tests, repository tests, quality, build and the
  recovery drill pass with the pasted output above.
- [x] Production call graph verified: the route table in the build output lists
  `/identity`, `/models/[...id]`, `/admin/identity`, `/admin/identity/[id]`,
  `/api/admin/identity/runs` and `/api/admin/identity/runs/[id]`; the admin nav
  and catalog link are the two entry points above.
- [x] FID status reflects the implementation state: `verified`, with the
  whole-repo HTTP gate explicitly blocked by FID-086 rather than reported green.

### Loop 2 — Independent audit and self-correction

- **RED:** The first storage draft put `identity` tables in the public schema
  and used `ensureColumn`, which assumes unqualified table names. It also made
  the public page call `getDatabase()` at module scope.
- **GREEN:** Moved every table under `identity.` with `CREATE SCHEMA IF NOT
  EXISTS`, removed `ensureColumn` from the new schema, and made the public read
  a runtime call inside a `try`. The admin page checks storage before rendering
  the form.
- **AUDIT:** `lib/storage/pg-adapter.ts:208` rewrites `?` placeholders but does
  not rewrite schema names; `db.exec` runs the multi-statement schema block;
  `migrateDatabase` wraps `applySchema` in a transaction. PGlite supports
  `CREATE SCHEMA`.  `lib/storage/schema/index.ts:19` is the only place the
  migration is composed. The new schema has no dependency on `catalogSchema`
  order. The full SQL block in this record was extracted and executed against
  PGlite 0.5.14 on 2026-11-01; it created all seven tables. `CREATE SCHEMA
  identity` and the partial unique index both work. Output:

  ```text
  tables: corrections,findings,protocols,references,runs,samples,verdicts
  run columns: id,target_model_id,target_name,canonical_model_key,provider_slug,
  upstream_id,target_json,provider_json,protocol_id,reference_id,
  control_model_id,control_provider_slug,control_upstream_id,control_json,mode,
  status,cancel_requested,estimate_json,actual_json,coverage_json,error_class,
  error_message,started_at,completed_at,created_at
  ```
- **ADVERSARIAL:** A second connection is not isolation. The identity store
  shares the application's Postgres role and connection pool in phase 1. The
  FID states that plainly and does not claim the `gateway_identity_worker` role
  from the research report. The repository boundary and the absence of billing
  imports are the enforceable part; a dedicated role is a later hardening
  record.
- **CHANGE DELTA:** Approximately 9% of the record.

### Loop 3 — Convergence pass

- **RED:** The estimate and the battery could drift, making the displayed cost
  a lie. The public copy and the verdict ladder could drift too.
- **GREEN:** `estimate.ts` derives its counts from the same `BATTERY_V2` object
  the runner uses; a test asserts the table's request total equals the
  estimator's. `view.ts` is the only source of public strings; a test asserts
  every state has copy and that prohibited words are absent. The protocol hash
  covers the battery, sampling, and decision constants; a test pins the hash.
- **AUDIT:** Every proposed file is under the 400-line ceiling by design:
  `runner.ts` orchestrates, `gates.ts` executes probes, `store.ts` persists,
  `view.ts` formats. The page components are split when a section would exceed
  the ceiling. The quality gate scans `app/`, `components/`, `config/`, and
  `lib/`.
- **ADVERSARIAL:** The system cannot prove weight authenticity, and a determined
  adversary can serve a compatible model only for the probe prompts. The public
  panel says "on the tested probes" and the methodology page lists the evasion
  limit. The response-level cache screen is descriptive, not proof. No wording
  in the FID claims otherwise.
- **CHANGE DELTA:** Approximately 4% of the record.

### Loop 4 — Seam audit against the live tree

- **RED:** Two create-step seams were wrong even though every named file
  exists. First, the step read the SQLite sync stores (`lib/store/models.ts`,
  `lib/store/providers.ts`) while the identity store is the Postgres handle.
  The ported catalog is the live production catalog after FID-086, and the
  SQLite and PGlite contents can differ locally, so a run could snapshot one
  catalog and publish against another. Second, it used the admin row's
  `upstreamSlug` and `protocol` as the probe target. Those describe the row's
  own provider; `toGatewayModel` shows a reconciled public id can be served by
  a different provider (`served_provider_slug`, `served_upstream_id`,
  `served_protocol`). Probing the row's provider would measure a route that
  does not answer the public id.
- **GREEN:** The create step now names `listAllModels(db)` and
  `listProviderRecords(db)` from `lib/storage/store/` and resolves the serving
  route with `getModelForGateway(db, modelId)`; `supportsTools` comes from the
  admin summary. The control is resolved through the same serving-route path,
  and a provider without a configured key is not a control. The probe fetch's
  `redirect: "error"`, `no-store`, and timeout rules are explicit in Security.
  `ensureProtocol` refuses a stored row whose battery hash
  differs (409), so a changed battery cannot reuse `aio-identity-v2`. The
  split-half rule splits each side's valid samples as evenly as possible above
  the 10-sample floor instead of assuming 20 per side.
- **AUDIT:** Verified `lib/storage/store/models.ts` (`listAllModels(db)`),
  `lib/storage/store/providers.ts` (`listProviderRecords(db)`),
  `lib/storage/store/model-sql.ts` (`MODEL_SELECT` is `m.*`, so the served
  fields are present), `lib/storage/runtime.ts:50` (lazy handle),
  `lib/providers/request.ts:32` (`providerHeaders`),
  `lib/providers/anthropic-translate.ts` (both translators), and
  `lib/storage/schema/index.ts:19` (single migration). Extracted the exact SQL
  block from this record and executed it against PGlite 0.5.14 on 2026-11-01:

  ```text
  schema_rerun: ok
  run_without_protocol: 23503
  duplicate_active: 23505
  new_run_after_completed: ok
  sample_rows_after_duplicate: 1
  unexpired_reference_rows: 0
  ```

- **ADVERSARIAL:** PGlite is one connection; this proves constraints, not
  concurrency. The duplicate-active result comes from the partial unique index,
  so the database refuses a second process even if the handler races; the HTTP
  suite still has to assert the 409. The admin read's stale sweep is a write on
  GET; it is idempotent and only targets rows older than two hours, but the
  page must render the storage error if that write fails.
- **CHANGE DELTA:** Approximately 7% of the record.

### Loop 5 — Product-truth and publication audit

- **RED:** The TTL rule rewrote every published verdict past `valid_until` to
  `stale`. For `mismatch_confirmed`, that erases a dated finding: a confirmed
  mismatch is a historical fact, not a current consistency claim, and the panel
  would silently stop showing it. Publish also accepted an already-expired
  verdict, so the operator could spend a step to publish a result that
  immediately reads `stale`. A blanket expiry rule would also have blocked a
  confirmed mismatch from ever being published, because confirmation does not
  publish itself. The verdict's `valid_until` had no stated derivation, so the
  TTL could not be implemented consistently. The rate section documented
  `IDENTITY_CONCURRENCY` while also saying batches run sequentially, so the
  setting had no defined behavior. The verification contract also promised a
  probe-client test in the steps but did not name it under Verification Gates,
  so closure could pass without it.
- **GREEN:** The public read applies the TTL only to `baseline`,
  `self_consistent`, and `consistent`; `mismatch_confirmed` keeps its date and
  `divergent_review` stays under review. Publish refuses an expired consistency
  verdict (409, expired consistency verdict) while a dated `mismatch_confirmed`
  is publishable regardless of TTL; the API table lists the distinction. The
  verdict's `valid_until` is `tested_at + 7 days`, the same TTL as the reference.
  The unused `IDENTITY_CONCURRENCY` setting is removed; the limiter and
  sequential batches are the only concurrency controls. The ladder's `stale`
  meaning now says "last consistency result," not "last run." Every promised
  test file is named in the steps and appears under
  Verification Gates, including `tests/identity-probe-client.test.mjs`.
- **AUDIT:** Re-read the exact copy column and the API table. The consistency
  copy carries "not independently verify" or "not a guarantee"; the canary
  finding carries "does not prove the absence"; no state claims weights. The
  TTL bypass is stated in the public-surface row, so the implementation test
  can assert it rather than infer it.
- **ADVERSARIAL:** A confirmed mismatch older than the TTL is still a dated
  operator finding, but the underlying route may have changed since; the panel
  keeps the date and the correction ledger and does not call the finding
  current. A `divergent_review` older than the TTL keeps the review state rather
  than aging into an implied pass. The remaining evasion limit is unchanged: an
  adversary can serve a compatible model only for the probe prompts, and the
  panel says "on the tested probes."
- **CHANGE DELTA:** Approximately 3% of the record.

## Resolution

- **Closed Date:** 2026-11-01 after `ffcb8b2`.
- **Fix Description:** Admin-run, operator-published advisory identity checks for
  free-pool models: sealed protocol and battery, direct upstream probes with an
  injected fetch, isolated `identity` evidence schema, baseline/verify verdicts,
  explicit publish/unpublish with a correction ledger, and the public model
  detail and methodology pages. No admission, credit, or settlement path is
  touched.
- **Tests Added:** Yes — `tests/identity-stats.test.mjs`,
  `tests/identity-protocol.test.mjs`, `tests/identity-estimate.test.mjs`,
  `tests/identity-view.test.mjs`, `tests/identity-store.test.mjs`,
  `tests/identity-runner.test.mjs`, `tests/identity-probe-client.test.mjs`.
- **Verification Evidence:** the receipt above and the live fixture
  baseline/publish run `6c0506b6-375a-4572-ae06-53152e1fb9ab`; `npm run
  test:http` and `npm run verify` remain red for FID-086's incomplete storage
  flip and that failure is recorded, not claimed as a pass.
- **Archived:** `dev/fids/archive/` in the closure commit.

## Dependencies and non-goals

**Dependencies.**

- FID-2026-1031-085 supplies the Postgres adapter and schema; FID-2026-1031-086
  records the production cutover, which is still incomplete and is the stated
  reason `npm run test:http` and `npm run verify` are red. The identity store
  works locally through PGlite and requires `DATABASE_URL` in production. This
  FID does not modify the SQLite request path; the one store alignment it made
  is the account page reading policy acceptance from the same SQLite lane that
  writes it. The admin identity page reads the ported Postgres catalog, not the
  SQLite facade, so local use requires `npm run db:import` (or FID-086's
  cutover) to hold the same public ids. An empty import renders an empty picker
  with a setup note, not an error.
- The existing provider types (`ProviderRecord`), auth header builder
  (`providerHeaders`), and wire translators (`toAnthropicRequest`,
  `toOpenAiCompletion`) are reused. `providerFetch` and the customer-facing
  adapters are not; the probe client takes an injected fetch. No new runtime
  dependency is added; the battery, statistics, probe client, and runner are
  reimplemented in strict TypeScript.
- The ten reference repositories stay under `resources/`; none is imported,
  copied, or linked. `api-relay-audit` is AGPL-3.0-only and contributes
  concepts only.

**Non-goals for FID-087.** This record does not implement or claim:

- user-funded or sponsor-funded runs, credit debits, or API-key-supplied runs;
- a public self-serve runner or a public quality benchmark lane;
- local FP16/Q4 ground-truth arms, weight inspection, or quantization claims;
- exact tokenizer conformance (no local tokenizer dependency);
- a calibrated false-positive/true-positive certificate;
- a dedicated least-privilege database role;
- context binary search beyond the three tested depths;
- competitor audits or named comparisons;
- automated quarantine, delisting, or request blocking.

The ordered build path in `docs/research/aio-source-review.md` §12.6 remains the
plan; the later steps receive their own records. Nothing here trims that plan.

## Lessons Learned

A trust feature fails in the copy before it fails in the code. The strongest
correction in this record was removing the word "verified" and splitting
self-consistency from independent comparison. The second lesson is that the
cheap probes are only cheap if the battery is counted: the estimator and the
runner must share one manifest, or the price shown to the operator is a guess.
The third is that isolation is a property of imports and tables, not a comment:
the identity path must never import the credit, settlement, or customer stores,
and the schema must have no cross-boundary foreign keys. The fourth is that a
seam is not real because the file exists; it is real because the data source and
the route are the same. The create path can name three real modules and still
probe the wrong provider or read the wrong catalog.
