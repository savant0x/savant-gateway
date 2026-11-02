# Model identity and fingerprinting — Deep Research prompt

> Paste everything below the horizontal rule into Gemini Deep Research. The
> report it returns is an input to a FID, not an implementation. No application
> code is written from this prompt.

---

## Role and objective

You are a research scientist and systems architect specializing in large-language-model
evaluation, model provenance, and statistical detection. You are designing a
production **model identity and fingerprinting system** for Savant Gateway, a
commercial OpenAI-compatible inference reseller.

The operator's thesis:

> A reseller that sells at 75–95% below OpenRouter is presumed to be serving
> quantized, substituted, or unreliable models until proven otherwise. A
> reproducible, statistically rigorous identity-evidence system on every model
> page is the trust counterweight — and it is a differentiator no content
> aggregator or plain catalog can copy.

The operator's direction is explicit: **rebuild a dedicated eval for this task**.
Savant-code's Benchmark v2 is a design reference for rigor, not a system to port
wholesale. Survey MIT-licensed and other permissively licensed GitHub projects
for inspiration — probe orchestration, tokenizer analysis, logprob comparison,
statistical testing, security probing, and evidence reporting — then design a
bespoke eval that fits the gateway. The default is our own implementation;
open-source projects are inputs, not dependencies.

The system must answer, for each route, a narrow set of questions:

- Is the route serving the model family and version its catalog claims?
- Is it injecting hidden context, a persona, or phantom tools?
- Is it quantized, distilled, or otherwise degraded — and can that be proven
  through an API rather than inferred?
- Is the result stable across calls, time, keys, and upstream routing?
- What can be published honestly, and what must remain **unknown**?

The output is a research and architecture report. Do not write application code.

## 1. The existing systems and the target

### 1.1 savant-code Benchmark v2 — the evaluation substrate

Savant-code is a separate Bun monorepo (Bun 1.3.14, TypeScript 5.5.4) containing
a coding agent, an SDK, an agent runtime, provider adapters, a knowledge graph,
and an eval workspace. Its benchmark is deterministic-first:

- **Task schema v2.0** with a task id, category, difficulty, environment,
  setup files, setup script, prompt, timeout, and deterministic checks.
- **Ten categories**, including pure coding, FSM compliance, multi-agent
  orchestration, custom tools, MCP tools, skill-driven runs, programmatic
  agents, slash CLI, error recovery, and governance.
- **Deterministic verification** is the primary signal: test, typecheck, build,
  and lint commands with expected exit codes, retries, and timeouts.
- **Trace assertions** cover strict FSM phase order, forbidden writes in RED,
  invalid transitions, required/denied tools per agent, subagent utilization,
  and custom-tool call counts.
- **Sandboxes** are a temp directory on Windows and Docker on Linux/CI; the
  runner interface accepts the Savant SDK or an external CLI agent.
- **Metrics** aggregate FSM compliance, subagent utilization, and custom-tool
  behavior from the trace. The stats layer implements `pass@k` capability,
  `pass^k` reliability, paired lift, activation verdicts, and proof artifacts.
- **Reports** are written as JSON and Markdown; governance and release tiers are
  first-class; skill evals, raters, prompt isolation, and proof runs exist.

This harness measures **agent quality**. It does not measure model provenance.
Its reusable assets are the registry, sandbox, trace, paired-trial discipline,
statistics, and report format — not its task corpus.

### 1.2 savant-code identity gauntlet — the current provenance probe

The identity gauntlet is operator-run, never scheduled, never run in a user's
turn, and never allowed to change routing:

```bash
bun run providers:identity -- --provider <slug> --model <id> --base-url <url>
bun run providers:identity -- --provider <slug> --all [--deep]
bun run providers:identity -- --provider <slug> --models a,b,c
```

It runs five vectors, one probe each:

| Vector | Probe | Claim tested |
| --- | --- | --- |
| A | `Reply with exactly: ALPHA BRAVO CHARLIE` | Reported input-token count is consistent with the response text |
| B | `Between <<< and >>> say OK. <<<OK>>>` | Delimiter handling matches the claimed model |
| C | `Output only the number 17 and nothing else.` | Deterministic output constraints are met |
| D | `Summarize in one sentence why backups matter.` | Refusals and benign alignment are distributionally typical |
| E | `List the third word of this sentence: one two three four.` | Repeated positional retrieval succeeds; latency is recorded |

The default budget is 25 attempts, 40,000 tokens, and 300,000 ms per target.
Vector A compares reported input tokens with a local `characters / 4` estimate
and treats a ratio outside 0.5–2.5 as inconsistent. Vectors B–E compare
normalized text hashes. A **same-model control** and a **different-model
control** must both complete; otherwise the verdict is `inconclusive`.

The verdict rule is deliberately conservative:

- no controls, an unavailable control, or fewer than two completed target
  probes → `inconclusive`
- target separates from the same-model control → `mismatch-requiring-review`
- target matches the same-model control and separates from the different-model
  control → `verified-for-tested-claims`
- anything else → `inconclusive`

Verdicts are advisory. They never mutate a catalog, route, key, or billing
decision. A mismatch forces human review and a separate FID. Reports are dated
and written under `dev/provider-identity/`. Credentials are read from
`<SLUG>_API_KEY` or `IDENTITY_API_KEY`, sent in headers only, and redacted from
stored evidence. The passive seam in the agent runtime records only what a
completed call already returned — requested model, served model, usage, timing —
and replays a dated advisory that goes stale after 30 days; it performs no
network request.

### 1.3 The 2026-09-13 provider audit — why the threat is real

A separate operator audit of two third-party gateways, **not** the gateway's
current upstream, used five evidence classes across 18 and 15 model listings:

1. **Tokenizer fingerprint** — one fixed string (English, Chinese, code, emoji)
   sent to every model; compare reported `prompt_tokens` with an honest-channel
   baseline. A jump of hundreds of tokens indicates hidden injected context.
2. **Upstream self-report** — the `model` field returned by the API.
3. **Self-identification** — English and Chinese "which model and company
   created you" prompts; weak alone, corroborating in aggregate.
4. **System-prompt leak probe** — a canary system message plus an instruction to
   repeat everything above it; extracts injected personas and phantom tools.
5. **Verifiable coding smoke** — a deterministic question with a known answer,
   to distinguish "serving something real" from "serving nothing."

The audit found real substitutions, version swaps, hidden operator prompts,
phantom tool definitions, dead listings, and empty completions. It also recorded
the caveats that matter for any rebuild: reasoning models can spend the entire
output budget on hidden reasoning and return empty visible text; tokenizer-family
differences move honest baselines by tens of tokens, so the tell is hundreds;
and a provider's optional model-fallback feature can confound a served-name
read. The audit was personal-use intelligence, not a product system. It does not
establish anything about the gateway's current upstream.

### 1.4 Savant Gateway — where the evidence must live

Savant Gateway is a Next.js 16 App Router application with strict TypeScript,
HeroUI v3, Tailwind 4, and a storage port from SQLite to managed Postgres. As of
the fact sheet:

- **44 catalog rows**: 11 free-pool, 23 priced, 10 subscription-only; one
  upstream account; 15 requests per minute account-wide; 20,000,000 weighted
  tokens per day on the free plan; paid wallet unfunded.
- **Pricing**: 25% markup over the synced rate card; 20.2% blended gross margin
  on priced rows; 17 of 19 OpenRouter-matched paid rows cheaper than OpenRouter.
  The operator's "75–95% cheaper" is a per-row public-price gap, not a
  catalog-wide constant.
- **Catalog shape**: public model id, upstream id, name, family, context window,
  token weight, free/paid/subscription access, group, input/output sell price,
  tool and vision flags, health, sync time.
- **What exists**: `/models` is one catalog table; `/compare` compares two
  models; Artificial Analysis benchmark rows and a live `vs OpenRouter` price
  comparison are displayed. There is **no `/models/[id]` page**, no identity
  table, no fingerprint scheduler, and no public evidence surface.
- **What exists for money**: accounts, scoped keys, integer micro-dollar pricing,
  credit holds, settlement, Stripe webhook fulfillment, subscriptions, free-pool
  allocation, admin control plane. Stripe Checkout is hosted, not embedded.
- **What is sacred**: the billing path. Content or identity work must never
  block, slow, or corrupt admission, holds, settlement, credit, or keys. A
  content or identity outage must leave inference serving normally.
- **Storage**: the Postgres cutover is in progress, not complete. Any new schema
  lands after the cutover, with a separate schema and role; no dual-database
  window.
- **Quality gates**: 400-line file ceiling over `app/`, `components/`, `config/`,
  `lib/`; strict TypeScript; zero lint warnings; `npm run verify`; real HTTP and
  recovery suites.

## 2. The gap

The current gauntlet is honest but shallow. It can catch a blatant substitution
or a missing endpoint, and its control discipline prevents a single probe from
becoming an accusation. It cannot support a public claim that a route serves a
claimed model version:

- Five one-shot probes are not a fingerprint battery.
- Vector A uses a `characters / 4` estimate, not the claimed model's tokenizer,
  and a 0.5–2.5 band is wide enough to miss meaningful differences and narrow
  enough to flag legitimate chat-template overhead.
- Text-hash equality is confounded by non-determinism, routing, temperature,
  provider post-processing, and ordinary model variance.
- There is no repeated sampling, no confidence interval, no power analysis, no
  multiple-comparison control, and no calibrated false-positive/false-negative
  rate.
- Controls are an operator-authored manifest; there is no control registry,
  provenance enforcement, version pinning, or aging policy beyond a timestamp.
- There is no tokenizer ground truth, logprob analysis, long-context retrieval,
  tool-schema battery, quantization probe, or adversarial-evasion test.
- There is no gateway integration: no Postgres tables, no scheduler, no model
  page, no admin review queue, no public evidence API, no customer-facing wording.
- The audit's five evidence classes were a one-off script, not a reproducible
  product.

## 3. Hypotheses to evaluate

Answer each as **supported**, **unsupported**, or **unknown**, with evidence.

- **H1 — The trust gap is material.** A price gap this large makes skeptical
  developers assume substitution or quantization, and verified identity evidence
  changes their willingness to try or buy. (Commercial hypothesis; test design
  required.)
- **H2 — A multi-class battery can detect the important failures.** Tokenizer,
  logprob, behavioral, control, and context-integrity probes can distinguish
  family substitution, version swaps, hidden prompt injection, and (where
  provable) quantization through an OpenAI-compatible API, at a useful
  precision/recall and cost.
- **H3 — The current five-vector gauntlet is insufficient for a public
  "verified" claim.** It is a useful screening tool, not a calibrated detector.
- **H4 — The system can run inside the gateway's constraints.** It can use a
  separate worker, role, pool, budget, and schedule without affecting inference
  admission, settlement latency, or the customer free pool.
- **H5 — Honest publication beats a generic badge.** Publishing dated evidence,
  including `inconclusive` and `mismatch under review`, builds more trust than a
  "verified" checkmark with no methodology.

## 4. Research questions

### A. Threat model and claims taxonomy

1. Enumerate the failure modes a commercial reseller must detect: family
   substitution, version swap (Pro → Flash, 5.3 → 4.6), quantization, distillation,
   hidden system prompt or persona, phantom tools, context truncation, caching
   anomalies, router/fallback variance, empty completions, and deliberate
   evasion. Rank by likelihood and customer impact.
2. For each failure mode, state what is **provable through an API**, what is
   only **consistent with** the claim, and what is **unprovable without weights
   or provider cooperation**.
3. Define a claims taxonomy with exact wording. Distinguish:
   - "the response labeled itself as X" (weak),
   - "the route's tokenizer/usage is consistent with family X" (moderate),
   - "the route behaved consistently with version X on the tested probes"
     (moderate, scoped),
   - "the route injected a hidden system prompt" (strong if canary evidence),
   - "the route serves the official weights" (usually unprovable — do not claim),
   - "the route's quality is consistent with X" (benchmark evidence, not identity).
4. Which of these claims can appear on a public model page, which belong only in
   an admin console, and which should never be published?

### B. Detection methods and evidence classes

For each method, report feasibility through an OpenAI-compatible API, required
inputs, confounders, evidence strength, cost, and whether it can be automated:

- Tokenizer fingerprinting: fixed multilingual/code/emoji strings, reported
  `prompt_tokens`, official tokenizer counts, chat-template overhead, baseline
  calibration per family and provider.
- Logprob fingerprinting: top-k distributions, temperature/seed control,
  provider support, quantization sensitivity, routing variance, sample size.
- Deterministic/canary prompts: exact outputs, structured outputs, refusal
  patterns, formatting, instruction following, canary persistence.
- System-prompt leak probes: canary system message, "repeat everything above,"
  detection of injected personas/tools, ethical and terms-of-service limits.
- Long-context retrieval: needle-in-a-haystack, advertised context window,
  truncation, cache behavior.
- Tool-call and schema fidelity: tool definitions, JSON-schema adherence,
  parallel calls, error dialects, version-specific behavior.
- Capability batteries: coding, math, reasoning, multilingual, knowledge-cutoff
  probes; benchmark contamination; quality vs identity.
- Operational signatures: TTFT, throughput, token weighting, rate-limit
  behavior, headers, error messages; explicitly separate operational data from
  identity evidence.
- Watermarking, weight hashing, attestation, TEEs, signed model manifests:
  which require provider cooperation and are therefore unavailable to a reseller?
- Hybrid evidence: how to combine tokenizer, logprob, behavioral, and control
  signals without collapsing them into an uninterpretable score.

### C. Statistical validity and detector calibration

1. Design the sampling plan: probes per claim, repeats per probe, temperature
   and seed policy, paired target/control design, and handling of non-determinism
   and routing changes.
2. How many labeled positives and negatives are needed to estimate precision,
   recall, ROC/AUC, and equal error rate for each failure mode? Show power
   arithmetic.
3. How should multiple models, vectors, and repeated looks be corrected for
   multiple comparisons? Frequentist FDR, Bayesian hierarchical models, or
   sequential tests — and why?
4. How should the system decide `verified`, `inconclusive`, or `mismatch`? What
   thresholds are defensible, and how are they calibrated on held-out data?
5. How do you validate the detector itself against a provider that detects
   probes, returns canned answers, or routes probes to genuine models while
   serving substitutes to customers? Propose randomized prompts, production-like
   sampling, holdout batteries, and third-party replication.
6. How should evidence age? Define freshness windows, re-test triggers, and
   change-point detection for model updates, provider changes, and key rotation.
7. What is the cost of a false accusation versus a missed substitution? How does
   that asymmetry change the threshold and the publication policy?

### D. Controls and ground truth

1. What are the valid controls for 44 models from one upstream: official API,
   open-weight local inference, sibling versions, known-good resellers,
   historical baselines, synthetic models that echo labels?
2. How do you prevent circularity — using the same upstream or the same routing
   layer as both target and control?
3. How should controls be sourced, licensed, budgeted, version-pinned, and aged?
   What happens when a control model is deprecated or its API changes?
4. How do you build a labeled corpus of known substitutions, version swaps, and
   quantized variants without violating provider terms? Can the 2026-09-13 audit
   findings be reused as historical labels, and what are their limits?
5. What ground truth is available for tokenizer counts, logprobs, seeds, context
   windows, and tool schemas? Which public tokenizer libraries and model cards
   are authoritative?

### E. Production architecture

1. Propose the full architecture: scheduler or on-demand trigger, queue, worker,
   advisory lock, rate limiter, budget, retries, timeouts, idempotency, redaction,
   run records, manifest versioning, control registry, verdict engine, alerting,
   admin review, public evidence API, model-page module.
2. Where should the worker run? A separate Node process on the same host, a
   scheduled job, a queue-backed service, or a Python sidecar? Consider the
   gateway's one-process/one-volume topology, Bun/TypeScript vs Node, and the
   quality gates.
3. Propose the Postgres schema: targets, manifests, probes, controls, runs,
   samples, findings, verdicts, incidents, reviews, public projections. Include
   keys, indexes, retention, and the separation from billing tables.
4. How do you guarantee the identity path cannot affect admission, holds,
   settlement, keys, or the free pool? Separate role, pool, statement timeout,
   query budget, feature flag, kill switch, and failure isolation.
5. How should secrets, raw responses, and provider content be stored? Redaction,
   hashing, retention, deletion, and audit logging.
6. How should the system expose evidence to the model page, the admin console,
   and a public methodology page without coupling the read path to the worker?
7. What observability is required: coverage, freshness, cost, mismatch queue,
   review SLA, false-positive audits, and incident linkage?

### F. Gateway integration and public presentation

1. Design the `/models/[id]` identity module: status, tested claims, date,
   manifest version, sample size, controls, evidence summary, methodology link,
   and a clear "what this does not prove" note.
2. What are the exact labels and colors for `verified-for-tested-claims`,
   `inconclusive`, `mismatch under review`, `not tested`, and `stale`? How do you
   prevent a user from reading any of them as a quality score or a guarantee?
3. Should identity evidence influence ranking, filtering, or the purchase CTA?
   If a model is `mismatch under review`, should the CTA change, the model be
   hidden, or the page show a warning? Recommend a policy.
4. How does identity evidence interact with the existing Artificial Analysis
   quality benchmark and the `vs OpenRouter` price comparison? Keep them
   visibly separate.
5. What belongs on the public methodology page: probe manifests, prompts,
   control provenance, statistical thresholds, raw redacted samples, known
   limitations, correction log?
6. How should the model page behave for a model that has never been tested, a
   model whose verdict is stale, and a model with no available control? No
   placeholder badges, no implied verification.

### G. Cost, cadence, and capacity

1. Model the cost per model per sweep: probes, repeats, controls, tokens,
   upstream price, worker time, storage. Use the gateway's real price range and
   show arithmetic.
2. Model a full 44-model sweep and a monthly monitoring cadence. What fits
   inside the 15 RPM and 20M weighted-token/day limits without consuming
   customer capacity?
3. Which models deserve deep testing versus a cheap handshake? How should the
   schedule tier by revenue, risk, and change frequency?
4. What is the cost of a false positive in operator time, support, and provider
   relations? Compare it with the cost of a missed substitution.
5. Recommend a budget cap, a concurrency policy, and an off-peak schedule.

### H. Legal, ethical, and provider relations

1. What do provider terms say about automated probing, rate limits, resale, and
   publishing results? Cite the relevant terms and flag what must be confirmed
   with counsel.
2. How should the operator publish a negative finding without defamation,
   commercial disparagement, or tortious interference exposure? What evidence
   threshold, right-of-reply, correction, and retraction process is required?
3. Distinguish "observed inconsistency" from "fraud." What wording is defensible
   when the evidence is a tokenizer delta, a self-identification, or a canary
   leak?
4. What are the consumer-protection and advertising requirements for a
   "verified" badge? How does the FTC substantiation standard apply to a
   first-party badge on products the operator sells?
5. What privacy, data-retention, and disclosure obligations arise from storing
   probe prompts and provider responses?
6. Should the operator test only its own upstream, or also third-party providers
   for comparison? What changes legally and commercially?
7. What is the escalation path before a public claim: independent replication,
   provider contact, waiting period, legal review, and a public correction if the
   finding is wrong?

### I. Build versus buy and reuse

1. Survey existing evaluation and security frameworks — Inspect, LM Evaluation
   Harness, HELM, OpenAI Evals, promptfoo, Garak, PyRIT, and comparable tools —
   for probe orchestration, statistical analysis, and reporting. Which ideas
   should be borrowed, and which should be avoided?
2. Survey **MIT-licensed and other permissively licensed GitHub projects** for
   inspiration: model fingerprinting and watermarking, LLM eval harnesses,
   API-provider auditing, tokenizer and logprob analysis, statistical testing,
   security probing, and evidence reporting. For each, record the URL, license,
   last commit or release, maintenance signal, language, what to borrow, what
   not to borrow, integration cost, and whether it is a reference or a viable
   dependency. Verify the license text; do not rely on a repository badge.
3. The operator's default is to **rebuild a bespoke eval** for model identity.
   Which parts of savant-code's Benchmark v2 are reusable as design patterns:
   task registry, sandbox, trace, metrics, paired trials, `pass@k`/`pass^k`,
   report format, governance? Which parts are specific to coding-agent quality
   and should not be forced onto API identity probes?
4. Should the gateway build a dedicated `lib/identity` module, a separate worker,
   or a small service? Consider TypeScript strictness, the 400-line ceiling,
   Bun vs Node, testability, and deployment. Recommend a bespoke design, not a
   port of the coding-agent harness.
5. What is the smallest **complete** architecture — not a reduced feature set —
   that can run one full sweep, store evidence, show a model-page module, and
   support an operator review? Sequence dependencies; do not cut the target.

### J. Roadmap and acceptance

1. Propose a dependency-ordered roadmap for the full system: schema, worker,
   probe battery, controls, statistics, verdicts, admin review, public API, model
   page, monitoring, legal review, launch.
2. Give acceptance criteria per milestone: a labeled corpus with measured
   precision/recall, a full sweep with cost and runtime, a mismatch drill, a
   control-aging drill, a billing-isolation test, and a public methodology page.
3. What must be true before the first public badge appears? What must be true
   before a mismatch can quarantine a model? What must be true before the
   methodology is called reproducible?
4. What would make the operator delay or reject the public launch of the
   identity system?

## 5. Deliverables

Produce a report with these sections. Use tables where a table is clearer than
prose, and show the arithmetic for every number you assert.

1. **One-page verdict.** Is the full system worth building, what can it honestly
   claim, and what is the first executable slice?
2. **Claims taxonomy and threat model.** Failure modes, provability, customer
   impact, and exact public wording.
3. **Detection-method matrix.** Method, API feasibility, confounders, evidence
   strength, cost, automation, and recommended role.
4. **Statistical design.** Sampling plan, power analysis, calibration, thresholds,
   multiple-comparison control, sequential monitoring, and detector validation.
5. **Control strategy.** Sources, provenance, aging, circularity, and labeled
   corpus.
6. **Architecture and schema.** Worker, queue, Postgres tables, roles/pools,
   retention, redaction, APIs, feature flag, and failure isolation.
7. **Gateway integration and UI.** Model page, admin review, methodology page,
   labels, empty/stale/mismatch states, and decision rules.
8. **Cost and cadence.** Per-model, per-sweep, monthly, and false-positive cost,
   with arithmetic against the gateway's real prices and limits.
9. **Legal and ethical checklist.** Provider terms, publication policy,
   defamation/disparagement, FTC substantiation, privacy, and correction process.
10. **Open-source inspiration register and build-versus-buy.** MIT/permissive
    GitHub projects with license, URL, last commit, maintenance, what to borrow,
    what not to borrow, integration cost, and a recommendation for a bespoke
    eval. Include the savant-code reuse analysis.
11. **Roadmap and acceptance criteria.** Full target, dependency order, and
    measurable gates.
12. **Metrics and decision rules.** Detector precision/recall/EER, coverage,
    freshness, cost per model, review SLA, public correction rate, and the
    conditions for expanding or pausing publication.
13. **Anti-patterns and rejected approaches.** Why each would damage trust,
    legality, or the billing path.
14. **Open questions for the operator.** Decisions only the owner can make.

## 6. Output rules

- Mark every material claim as **measured**, **assumption**, or
  **recommendation**.
- Cite public sources for academic methods, provider policies, legal standards,
  frameworks, and pricing. Include URLs and access dates. Do not invent
  citations or numbers.
- Distinguish **detection** from **proof**. Never claim that an API probe proves
  model weights, training data, or provenance unless a cited method actually
  does.
- Show the arithmetic for every cost, sample-size, and power number.
- For every GitHub project, cite the URL, license, last commit or release date,
  and access date. Distinguish MIT, Apache-2.0, and BSD from copyleft licenses;
  do not recommend a dependency whose license conflicts with a commercial hosted
  service.
- Treat open-source projects as inspiration unless the report shows a concrete
  maintenance, security, and license case for adopting one. The default is a
  bespoke eval built for this task.
- Prefer tables for comparisons and keep the report under 6,000 words.
- Explicitly answer H1–H5 as supported / unsupported / unknown.
- Include a short "what would change my mind" section.
- No generic advice ("build trust", "monitor quality"). Every recommendation must
  be specific enough to implement or test.
- Do not reduce the scope. The operator has 25+ years of programming experience
  and has run multi-million-dollar businesses alone. Sequence dependencies and
  risk; do not shrink the target because one person will build it.

## Appendix A — measured fact sheet (2026-11-01)

### Savant Gateway

| Item | Value |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, HeroUI v3, Tailwind 4, strict TypeScript |
| Storage | SQLite today; managed Postgres port in progress; production requires `DATABASE_URL` |
| Catalog | 44 rows: 11 free-pool, 23 priced, 10 subscription-only |
| Upstream | One account; 15 requests/minute account-wide; 20,000,000 weighted tokens/day on the free plan; paid wallet unfunded in the fact sheet |
| Markup | 25% over synced cost |
| Blended gross margin | 20.2% on priced rows (equal weight per model) |
| Price position | 17 of 19 OpenRouter-matched paid rows cheaper; operator reports 75–95% per-row gaps |
| Model surface | `/models` catalog table and `/compare`; no `/models/[id]` |
| Benchmark surface | Artificial Analysis quality rows; `vs OpenRouter` price comparison |
| Identity surface | None: no table, scheduler, public API, or model-page module |
| Payments | Stripe hosted Checkout; webhook fulfillment; no embedded Checkout |
| Billing path | Admission, holds, settlement, credit, keys, free pool; must never depend on content or identity |
| Traffic | Pre-launch; no real customers, no production traffic, no live payment |
| Quality gates | `npm run verify`: lint, typecheck, config, tests, quality, build, HTTP, recovery; 400-line file ceiling |

### savant-code

| Item | Value |
| --- | --- |
| Runtime | Bun 1.3.14; TypeScript 5.5.4; monorepo with `evals`, `sdk`, `cli`, `agents`, `packages/*` |
| Eval | Benchmark v2: schema 2.0; 10 categories; deterministic checks; FSM/trace assertions; temp-dir and Docker sandboxes; `AgentRunner`; JSON/Markdown reports |
| Stats | `pass@k`, `pass^k`, paired lift, activation verdicts, proof artifacts |
| Identity CLI | `bun run providers:identity -- --provider <slug> --model <id> --base-url <url>` |
| Identity vectors | A token-count consistency; B delimiter handling; C deterministic output; D refusal/alignment; E positional retrieval/latency |
| Identity budget | 25 attempts, 40,000 tokens, 300,000 ms per target |
| Identity verdicts | `verified-for-tested-claims`, `mismatch-requiring-review`, `inconclusive` |
| Identity controls | Same-model and different-model endpoints from an operator manifest; absent/unavailable → `inconclusive` |
| Identity reports | Dated Markdown + JSON under `dev/provider-identity/` |
| Identity authority | Advisory only; no routing, catalog, key, or billing mutation |
| Passive seam | Records already-returned served model/usage/timing; no network; 30-day staleness advisory |
| Quality gauntlet | Coding rubric against one discovery candidate; operator-run; 60 s timeout per call |
| Operator direction | Rebuild a dedicated model-identity eval; savant-code is a design reference; MIT/permissive GitHub projects are inspiration, not the default dependency |

### Audit facts (third-party gateways, not the current upstream)

| Finding | Count |
| --- | --- |
| Substituted models | 3 (hcnsec) + 1 (tokenbom) |
| Version swaps | 3 (tokenbom) |
| Hidden prompt injection / persona | 4 extracted + 2 fingerprint-only |
| Phantom tool definitions | 1 (`step-router-v1`) |
| Dead or unavailable listings | 3 (hcnsec) + 3 (tokenbom: 2 no-supply, 1 dead) |
| Broken/empty completions | 1 (tokenbom) |
| Genuine/clean | 6 (hcnsec) + 5 (tokenbom) |

These findings prove the threat class is real. They do not establish that the
gateway's current upstream commits any of them.

## Appendix B — current probe manifest and verdict rule

The five probe texts and claims are reproduced in §1.2. The exact rule is:

```text
if same-model control missing or unavailable: inconclusive
if different-model control missing or unavailable: inconclusive
if completed target probes < 2: inconclusive
if target separates from same-model control: mismatch-requiring-review
if target matches same-model control and separates from different-model control:
  verified-for-tested-claims
otherwise: inconclusive
```

Vector A's band is 0.5 ≤ ratio ≤ 2.5. A provider that reports no token usage is
`no-signal`, never a tokenizer breach. An exhausted budget names the dimension
that ended it; it is never silently truncated into a pass. A composite score is
emitted only with held-out calibration; no numeric auto-failover threshold is
applied anywhere.

## Appendix C — what the current system does not claim

- It does not prove that a route serves official model weights.
- It does not prove the absence of quantization.
- It does not prove the absence of a hidden prompt; it can only report canary or
  tokenizer evidence.
- It does not prove that a model is good at a task; that is the quality
  benchmark's job.
- It does not change routing, pricing, access, or billing.
- It does not run on a schedule, in a user turn, or at startup.
- It does not cover every catalog route; a sweep covers only the routes it is
  given.

## Appendix D — decisions the report must make explicit

1. Is the rebuilt system **advisory evidence** or a **paid-traffic gate**? If a
   gate, what is the quarantine policy, who approves it, and how are customers
   notified?
2. Which claims will be **public**, which are **admin-only**, and which are
   **never made**?
3. Which failure modes are in scope for the first public badge — family
   substitution, version swap, hidden prompt injection, quantization, context
   truncation, or all of them?
4. Which controls are affordable and legally available for 44 models from one
   upstream?
5. What is the monthly budget cap for probes, controls, and operator review?
6. What evidence threshold and correction process govern a public mismatch
   finding?
7. Where does the evidence live before `/models/[id]` exists, and what is the
   first executable slice that does not create a dual-database window?
8. Which open-source projects, if any, are worth vendoring or wrapping, and
   which are only design references? The default is our own eval.

## Appendix E — open-source inspiration register (required table)

The report must include a table with these columns:

| Project | URL | License | Language | Last commit/release | Maintenance signal | What to borrow | What not to borrow | Integration cost | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Cover at least these categories:

- model fingerprinting and watermarking;
- LLM evaluation harnesses and task registries;
- API-provider auditing and red-teaming;
- tokenizer and logprob analysis;
- statistical testing and sequential analysis;
- security probing and prompt-injection testing;
- evidence reporting and audit trails.

For each project, state whether it is a **design reference**, a **small vendored
utility**, a **wrapped service**, or **avoided**, and why. Verify the license from
the repository's license file, not from a badge or a package-manager label.
