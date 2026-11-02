# AIO source review and build path

**Status:** proposal for operator approval. No application code was written for this review.
**Reviewed:** 2026-11-01.
**Review type:** static source review of the ten reference repositories, plus a
cross-check of the Gemini Deep Research report against those sources. No install,
build, or test command from a reference tree was executed; `resources/` is
reference-only and remains gitignored.

**Inputs**

- `resources/` snapshots of the ten repositories named in
  [`docs/research/fingerprint.md`](fingerprint.md) §10, archived 2026-11-01.
  The snapshots are default-branch ZIP trees with no `.git` history, so the
  report's last-commit and release claims could not be verified from them.
- [`docs/research/fingerprint.md`](fingerprint.md) — the Gemini Deep Research
  report. `docs/research/benchmark.md` is a byte-identical duplicate (same
  SHA-256, same 64,711 bytes); there is no separate benchmark report.
- The savant-code Benchmark v2 and identity-gauntlet review already in this
  session's record.
- The gateway's current state: 44 catalog models, 23 priced, no `/models/[id]`,
  hosted Stripe Checkout, and a Postgres cutover in progress.

> **Operator decisions — 2026-11-01.** The scope is amended by §12:
> admin-run and operator-published, advisory only, free-pool models first,
> API-only, with optional user-funded runs. Where §6.4, §6.6, §6.8, §7, §8,
> or §10 conflicts with §12, §12 governs.

---

## 0. Bottom line

The thesis is buildable. The Gemini report's statistics are not.

The ten repositories show that behavioral fingerprinting works, but they also
show what makes it defensible: a sealed probe protocol, protocol-matched
references, a measured false-positive rate, a decision rule that is valid under
continuous monitoring, and invariant gates that run before any distributional
comparison. The report proposes the right shape — scoped evidence, dated claims,
no binary badge — and the wrong mathematics: fixed JSD thresholds, SPRT
"accept H0 = verified," and Benjamini-Hochberg applied to numbers that are not
p-values.

The buildable design is:

1. **One evidence system, two independent lanes.** Quality and identity share a
   protocol registry, runner, evidence store, and report renderer. They never
   collapse into one score.
2. **Identity is a battery, not a single test.** Protocol/shape, determinism,
   token-count consistency, canary/hidden-context, behavioral fingerprint,
   deterministic canaries, context integrity, tool/schema conformance, stream
   integrity, conditional logprob analysis, cache/replay screening, and passive
   telemetry. Each has its own claim and its own limits.
3. **The behavioral decision is a calibrated e-process.** Protocol-matched
   reference counts, a betting martingale with α = 0.01, a tolerance δ
   calibrated by posterior predictive simulation, and early stopping. JSD is an
   effect size for humans, not the decision rule.
4. **No verdict without a calibration certificate.** The certificate records the
   sealed protocol hash, the detector version, the control and positive arms,
   the measured FPR and TPR with confidence intervals, and the exact limits.
5. **No identity claim without a trusted, protocol-matched reference.** Where no
   such reference exists — an exclusive route, a model with no direct vendor
   access — the status is `unsupported` or `consistency_only`, not `verified`.

The first executable artifact is **not** a public badge or a production worker.
It is a **calibration lab**: a sealed battery run against controlled local arms
(FP16 vs Q4/Q8, a small model swap, a hidden system prompt, a truncated
context) that emits a calibration certificate. Every later claim depends on it.

That is not a reduced scope. The full system is specified in §6 and §7. The
calibration lab is first because it is the evidence foundation, not because the
rest is optional.

---

## 1. Method, definitions, and limits

### 1.1 Method

- Read every repository's README, license, package metadata, and the source
  files that implement its claimed method. For the four largest frameworks
  (Inspect, LM Evaluation Harness, promptfoo, PyRIT), read the core contracts
  and the relevant modules rather than the whole tree.
- Confirmed licenses from each tree's own `LICENSE` file, not from a badge.
- Counted source and test files to distinguish a maintained framework from a
  small prototype.
- Re-computed the report's arithmetic where it made a numerical claim.
- Compared each report claim with the source behavior, not with the report's
  description of the source.

### 1.2 Definitions used in this document

| Term | Meaning |
| --- | --- |
| **Protocol** | The exact battery, system prompt, sampling parameters, normalizer, and answer domains. Identified by a SHA-256 over the canonical manifest. |
| **Reference** | A fingerprint collected from a trusted endpoint under a protocol. |
| **Target** | The route under test. |
| **Same-model control** | A protocol-matched reference for the model the target claims to serve. |
| **Different-model control** | A reference for a known different model, used to prove the detector separates this pair. |
| **Calibration certificate** | A sealed record of FPR, TPR, sample sizes, confidence intervals, detector version, and protocol hash. |
| **Coverage** | Probes attempted, answered, skipped, and crashed. A skipped probe is never a pass. |
| **e-process** | A non-negative wealth process. Reject H0 when wealth ≥ 1/α; valid at any stopping point. |
| **JSD** | Jensen-Shannon divergence, base 2, range [0, 1]. Used here as an effect size, not the decision rule. |

### 1.3 Limits of this review

- **No execution.** The reference trees were not installed or run. Every claim
  about their behavior is from reading the source and tests.
- **No commit SHAs.** The snapshots are ZIP trees without `.git`. The register's
  "last commit/release" and "maintenance signal" columns are unverified.
- **No external verification.** The paper's baselines are taken from the
  implementations' own constants and comments; the paper itself was not
  re-read for this review.
- **The savant-code review is second-hand.** The coding-agent harness lives
  outside this repository; the conclusions about Benchmark v2 and the identity
  gauntlet are from the review already recorded in this session, not a fresh
  read.

---

## 2. Verified inventory

Licenses were read from each tree's `LICENSE` file. Test-file counts are
recursive counts of `*test*.py`, `*.test.mjs`, `*.test.ts`, and `*.test.tsx`.

| Project | License | Size / shape | Test files | What it actually is | Use |
| --- | --- | --- | --- | --- | --- |
| `llm-fingerprint-detector` | MIT | 32 files; TypeScript; zero runtime deps | 6 | A clean implementation of the one-token behavioral fingerprint: 8 tasks × 2 languages, paraphrases, normalization, per-cell JSD, three-way verdict. | **Reimplement the patterns.** Closest engineering match. |
| `kvprobe` | Apache-2.0 | 18 files; Python stdlib; 3 source modules | 2 | A calibration-first substitution detector: 40 frozen probes, two T=0 passes, D = 1 − top-1 agreement, measured FPR, calibration certificate. | **Design reference for calibration discipline.** |
| `fpverify` | MIT | 15 source modules; Python; 7 test files | 7 | An anytime-valid e-process fingerprint with protocol-matched references, delta calibration, open-set nearest-neighbor reporting, and cache screening. | **Statistical backbone.** |
| `LLMmap` | MIT | PyTorch; 52-model template library; 2 test files | 2 | An academic open-set classifier that embeds responses and identifies the nearest known model. 2024-era model set. | **Open-set framing only.** |
| `inspect_ai` | MIT | Large Python framework | 701 | A task/solver/scorer evaluation framework with structured logs, sample/epoch semantics, bootstrap and Wilson intervals, and retry classification. | **Design reference for the quality lane and evidence schema.** |
| `lm-evaluation-harness` | MIT | Large Python framework | 50 | An academic evaluation harness with a precise `loglikelihood` and rolling-loglikelihood contract. | **Design reference for logprob-capable routes.** |
| `promptfoo` | MIT | Very large TypeScript CLI/UI | 1,452 | A prompt evaluation and red-team tool with a declarative assertion schema and provider adapters. | **Assertion-shape reference; not a dependency.** |
| `garak` | Apache-2.0 | Large Python security scanner | 187 | A probe/detector/buff security scanner with system-prompt extraction and n-gram containment scoring. | **Canary-probe reference; reimplement the n-gram check.** |
| `PyRIT` | MIT | Very large Python red-team framework | 1,076 | A multi-turn attack orchestrator with a provenance-rich message and finding model. | **Evidence-model reference; not a dependency.** |
| `api-relay-audit` | **AGPL-3.0-only** | 37 test files; Python + `curl` | 37 | A 14-step black-box relay audit: hidden prompt injection, context truncation, tool-call rewriting, error leakage, SSE integrity, infrastructure and latency fingerprinting. | **Read-only threat concepts. Zero code.** |

The register's recommendation column is directionally right for most of the
ten. It is wrong in at least three places: `kvprobe` is described as having
"Merkle root evidence logging" (the shipped code has no Merkle implementation;
the README mentions a Merkle root held in a private monorepo), `fpverify` is
described as "SPRT stopping boundary rules" (it uses a betting e-process, not
SPRT), and `garak` is listed under `leondz/garak` when the canonical repository
is `NVIDIA/garak` (the old URL redirects).

---

## 3. What each source actually implements

### 3.1 `llm-fingerprint-detector` — the closest engineering match

**What it does**

- Probe battery: 8 tasks × 2 languages = 16 cells, ordered by empirical
  discriminativeness. Tasks are random number (1–100 and 1–10), random letter,
  random color, coin flip, random animal, random city, and favorite number.
- Each cell has three or more paraphrases. A request draws one paraphrase at
  random, so a gateway cannot special-case a fixed string.
- Fixed minimal system prompt, `temperature=1.0`, `max_tokens=16`; reasoning
  models get an adapter that disables hidden thinking, with a documented
  post-reasoning fallback that lowers confidence.
- Answers are normalized (NFC, punctuation and emoji stripping, case folding,
  first word, digit unification, color and coin canonicalization) and classified
  as valid, invalid, refusal, empty, or error.
- Distance is mean per-cell JSD over cells where both sides have at least 10
  valid samples. Verdict bands are `match ≤ 0.25`, `uncertain ≤ 0.35`,
  `mismatch > 0.35`, plus `insufficient`.
- A split-half self-check computes JSD between even and odd arrivals within each
  cell. Above 0.25 it warns that the endpoint may be routing across multiple
  backends.
- Every fingerprint carries a protocol id. `compare()` sets `protocolMismatch`
  when the ids differ.
- The sampler shuffles the request queue, runs a small worker pool, records
  failures as error samples, aborts after 8 consecutive transport errors, and
  aborts immediately on 401/403. The HTTP layer retries 429, 5xx, and timeouts
  with `Retry-After` support and classifies errors as auth, http, timeout,
  network, or aborted.

**The single most important line in the entire source set**

`src/battery.ts` says:

> Swapping only the system prompt (all else equal) can shift a model's
> fingerprint by JSD ≈ 0.44–0.46 — the same magnitude as swapping the model
> itself — which would turn a prompt difference into a false "different model"
> verdict.

That kills any plan that compares a target against a direct-vendor reference
without proving both sides used the same system prompt, the same battery, and
the same sampling parameters. It also makes the canary/hidden-context gate a
prerequisite for the behavioral fingerprint, not an optional extra.

**The numbers that matter**

`src/constants.ts` records the paper's baselines: same model split-half ≈ 0.140,
same model served by a different provider ≈ 0.227, different models ≈ 0.463, and
an equal error rate of ≈ 10.6% with 8 cells and ≈ 7.3% with 40 cells. The
0.25/0.35 cut points are explicitly called heuristics, not proofs.

A 7–11% equal error rate is the honest ceiling of a fixed-threshold fingerprint.
It is not a reason to avoid the method; it is a reason to stop claiming that a
fingerprint "proves" identity.

**What to borrow**

- The battery shape (tasks × languages, paraphrases, one-word answers).
- The normalizer and the valid/invalid/refusal/empty/error categories.
- The per-cell JSD and split-half self-check.
- The protocol id and protocol-mismatch flag.
- The shuffled queue, error taxonomy, retry policy, and consecutive-error abort.
- The reasoning-adapter concept.

**What not to borrow**

- The fixed 0.25/0.35 thresholds. They are tied to the paper's battery and
  protocol. On our battery they are uncalibrated.
- The bundled sample references. `src/reference.ts` says they were collected by
  the paper's harness, a slightly different protocol, and are flagged
  `protocolMismatch: true`; they are explicitly "great for demos" and not for
  high-stakes verification.
- Adding the package as a runtime dependency. The gateway is Node/Next.js; the
  package is small and MIT, but its thresholds and protocol are coupled. We
  should reimplement the ~300 lines we need and own the calibration.

**Verdict:** the best source in the set for the identity lane's shape. Use it as
a design reference and a test oracle, not as a dependency.

### 3.2 `kvprobe` — the calibration certificate is the product

**What it does**

- 40 frozen probes across factual, arithmetic, code, longform, and deliberately
  ambiguous classes. The probe set is content-addressed; editing it changes
  `probe_sha256()` and invalidates prior seals.
- Each provider is probed twice at `temperature=0`. The primary statistic is
  `D = 1 − top1_agreement_rate`. JSD over top-k logprobs is auxiliary. When a
  provider exposes no logprobs, the comparison degrades to text-only and records
  that it did.
- The shipped calibration: 5 FP16 arms, 10 control pairs, D = 0.0–0.025;
  positive FP16 vs INT4-AWQ D = 0.825 (33/40 probes differ); positive FP16 vs
  FP8-KV D = 1.0 (40/40). τ = 0.025 from a sealed rule; measured probe-level
  FPR = 0.01 over 400 control comparisons; TPR = 1.0 on both positive arms.
- `load_calibration()` raises `NotCalibrated` rather than guessing. A verdict
  without a measured FPR is not a verdict.
- The verdict is descriptive: "fingerprint shifted by Δ at FPR f," never an
  accusation. Every verdict carries the benign explanations and the limits.
- The honest limits are unusually good: one model family, one GPU class, one
  engine build; greedy decoding only; control arms are near-identical, so the
  calibration says little about a genuinely noisy backend; TPR rests on one
  arm-pair per condition.

**The contradiction to fix before lifting any number**

The shipped `detector_calibration.json` contradicts itself:

- `MEASURED_FPR_probe_level` is `0.01` over 400 comparisons, which implies four
  false positives.
- `FPR_probe_level_95pct_upper_bound` is `0.0075`, the rule-of-three bound for
  **zero** observed events in 400 trials.
- `fpr_interpretation` says "0 false positives observed in 400 control
  probe-comparisons" — which is not what a 0.01 measured rate means.
- `honest_limits` still says the FP8-KV arm failed to boot and TPR is
  int4-only, while `AUDIT_F4_RESOLUTION_20260722` and the README say the FP8 arm
  booted and was detected at D = 1.0.

The code in `detector.py` is aware of the issue — it prefers a
`FPR_probe_level_95pct_upper_bound_HONEST` key and only applies the rule of
three when the measured FPR is zero — but the shipped artifact is stale. Do not
copy these numbers into our methodology page. Recompute them from a calibration
we own.

**What the CLI actually does**

`kvprobe run` probes the **same provider twice** and reports self-consistency.
It does not compare a reseller to a direct-vendor reference. The positive arms
were measured offline on self-hosted precision variants. The README's headline
question ("Is your provider serving the model you're paying for?") is broader
than the shipped CLI path. That is not fraud; it is a scope statement the README
makes more clearly than the CLI does.

**What to borrow**

- The calibration-certificate gate: no verdict without a measured FPR.
- The sealed probe set and its SHA-256.
- The control-arm discipline: same model, same precision, varying seed and batch;
  positive arms that differ only in the failure mode under test.
- The descriptive verdict and the explicit benign explanations.
- The rule-of-three language, used correctly: zero observed events in n trials
  gives a 95% upper bound of 3/n, not a measured zero.

**What not to borrow**

- The 40 generic probes. They are a demonstration set, not a gateway battery.
- The CLI's self-consistency-only path as if it were substitution detection.
- The stale calibration numbers.
- Any claim of Merkle evidence logging; the shipped code does not implement it.

**Verdict:** the best source for the calibration posture. Its central lesson —
the asset is the false-positive rate, not the detector — should be the first
sentence of our methodology page.

### 3.3 `fpverify` — the statistical backbone

**What it does**

- Probes are categorical questions with single-value answers: random number
  1–100, random number 1–10, favorite number, random letter, random color,
  favorite color, random animal, random city, coin flip. Each task has multiple
  paraphrases and four languages (English, Chinese, Russian, Arabic). The system
  prompt forces a one-word or one-number answer.
- A reference fingerprint is per-cell answer counts, collected from a trusted
  endpoint. The protocol id is `cold-single` (one request per question, fresh
  conversation). A separate `harness-battery` protocol exists for references
  collected inside an agent harness.
- The decision is a **testing-by-betting e-process**, not a fixed threshold.
  For each observation, the wealth is multiplied by a mixture Kelly factor
  `(1−λ) + λ·q̂(c)/p0(c)` and by `exp(−δ)`. The online estimate `q̂` uses only
  observations before the current one, preserving previsibility. The null is
  rejected when wealth ≥ 1/α. At α = 0.01 the threshold is 100.
- The reference model uses additive smoothing and a Good-Turing floor for the
  `<other>` category, so an unseen answer does not get zero probability and
  inflate the false-positive rate.
- `calibrate_delta()` runs a posterior predictive simulation: draw a plausible
  true distribution from Dirichlet(reference counts + Jeffreys 0.5), inject
  ±8% benign drift, simulate a stream of length `horizon`, and compute the
  smallest δ that keeps the wealth trajectory below `1/(α·margin)`. Take the
  maximum over simulations, multiply by 1.3, clamp to [0.005, 0.5]. The code
  explicitly says the resulting guarantee is "FPR ≲ α under the posterior
  predictive approximation," not an exact Ville bound.
- Protocol matching is a hard gate. A reference collected under a different
  protocol can only produce relative ranking (`BEST_MATCH` / `UNKNOWN`), never
  `PASS` / `FAIL`. The README records a concrete example: the same model answers
  a coin flip as "tails" in a battery protocol and "heads" in a cold single
  question.
- The verdict ladder is `PASS`, `FAIL`, `SUSPECT`, `BEST_MATCH`, `UNKNOWN`,
  `INCONCLUSIVE`. A `PASS` means "no evidence of substitution within the
  budget at the given α/δ," not "authentic." A `FAIL` means the e-process
  rejected the claimed model; it still carries the benign explanations.
- Cache screening is separate: variance collapse at T=1.0 plus anomalously low,
  stable latency is flagged as a response-level cache violation, independent of
  the fingerprint verdict.
- Every result includes the observed counts, so the verdict can be recomputed
  outside the tool.
- The tests actually test the statistical properties: e-variable fairness, FPR
  under H0, FPR under reference sampling noise, power against a swap, power
  against a pinned answer, power against a true-random endpoint, and
  auto-calibrated δ under a small reference.

**The numbers that matter**

`distance.py` records the paper's JSD bands: 0.140 same-origin noise, 0.227
cross-provider, 0.463 imposter median. `library.py` uses `BAND_MATCH = 0.18` and
`BAND_UNKNOWN = 0.32` for open-set ranking, not for hard verdicts.

Those are the numbers to compare with the Gemini report's claim of "same model
≤ 0.08." A real same-origin split-half is ≈ 0.14. The report's 0.10
"consistent" threshold would flag genuine deployments as inconsistent.

**What to borrow**

- The e-process decision rule, including the previsible online estimator, the
  mixture Kelly bet, and the anytime-valid threshold.
- The delta calibration by posterior predictive simulation.
- The Good-Turing `<other>` floor and the additive smoothing.
- The protocol-matched reference requirement and the verdict ladder.
- The cache screen.
- The observed-counts output for independent recomputation.
- The test ideas for FPR and power.

**What not to borrow**

- The Python implementation, the Chinese CLI text, or the library's public
  references as our ground truth.
- The claim that a `PASS` is verification. It is a bounded non-rejection.

**Verdict:** the statistical backbone. Port the algorithm, not the code.

### 3.4 `LLMmap` — open-set framing and template awareness

**What it does**

- Fingerprints 52 LLMs by embedding responses to a set of queries and training
  a classifier; open-set mode reports the nearest known model and a distance.
- The model set is 2024-era (GPT-4o-2024-05-13, Claude 3, Llama 3, Qwen 2). The
  pipeline is PyTorch and GPU-oriented.
- `make_prompt()` contains a detail worth keeping: if the tokenizer's chat
  template has no `system` role, it prepends the system prompt to the user
  message. That is a protocol difference, and it changes the distribution.

**What to borrow**

- The open-set question: not only "is it X?" but "what does it look like, and is
  it like nothing we know?"
- The `BEST_MATCH` / `UNKNOWN` distinction.
- The template-awareness gate: a route that does not support the system role
  must be tested under a protocol that specifies the fallback on both sides.
- The idea of selecting discriminative queries rather than a fixed generic set.

**What not to borrow**

- The PyTorch embedding classifier. It is heavy, trained on a stale model set,
  and has no measured FPR for our use.
- The 52-model library as a reference set.
- Any claim that nearest-neighbor distance is identity proof.

**Verdict:** design reference only.

### 3.5 `inspect_ai` — the evaluation contract

**What it does**

- A task is a dataset, a solver, and a scorer. A sample has an input, a target,
  and metadata. An epoch is a repeated sample. A score has a value, an answer,
  an explanation, a machine-readable `reason` for abnormal scores, metadata, and
  an edit history with provenance.
- It provides `bootstrap_stderr`, `stderr`, `var`, `ci`, and `ci_wilson`, plus
  clustered standard errors for grouped samples.
- It classifies model errors, retries transient failures, records retry events
  per sample, and preserves a structured log.
- It separates "not assessed" from "scored zero" — a scorer can return `None`.

**What to borrow**

- The `Score` contract for findings: value, answer, explanation, reason,
  metadata, history.
- The sample/epoch/error semantics for repeated probes.
- Wilson intervals for Bernoulli probes and bootstrap intervals for JSD effect
  sizes.
- The retry taxonomy: rate limit vs transient vs auth vs permanent.
- The structured log artifact.

**What not to borrow**

- The framework dependency, the Python async runtime, or the sandbox stack.
- A single aggregate metric for a multi-dimensional evaluation.

**Verdict:** design reference for the quality lane and the evidence schema.

### 3.6 `lm-evaluation-harness` — the loglikelihood contract

**What it does**

- `loglikelihood(context, continuation)` returns the log-probability of the
  continuation and whether it is greedy. Word-boundary spaces belong in the
  continuation.
- `loglikelihood_rolling(text)` computes the full log-likelihood with no
  truncation for perplexity. Inputs longer than the context are chunked; each
  token is predicted exactly once; the last chunk still gets a full-sized
  context; each document is scored separately.
- It has a task registry, prompt templates, filters, and extraction utilities.

**What to borrow**

- The rolling-loglikelihood specification, if we add a logprob-based
  quantization or perplexity probe.
- The discipline of putting boundary spaces in the continuation and scoring
  each token once.
- The separation of documents.

**What not to borrow**

- PyTorch, Transformers, or the academic benchmark suite.
- The assumption that a local tokenizer matches a serving engine's chat
  template.

**Verdict:** design reference only.

### 3.7 `promptfoo` — the assertion shape

**What it does**

- Assertions are declarative objects with a type, a value, a threshold, a
  weight, and a named metric. Assertion sets can nest and carry their own
  weight and threshold. A `not-` prefix negates an assertion.
- Results carry a pass/fail, a score, a reason, named component scores, and
  token usage.
- Providers have retry and error handling, including an HTTP provider.

**What to borrow**

- The declarative assertion shape: type, value, threshold, metric, and a
  machine-readable reason.
- The `not-` semantics for negative probes.
- The retry and error-classification patterns.

**What not to borrow**

- The 187 MB CLI/UI footprint.
- Weighted composite scores. The identity lane must emit orthogonal findings,
  not one number. The assertion *shape* is useful; the aggregation is not.
- Generic prompt-tuning features.

**Verdict:** design reference for probe assertions; not a dependency.

### 3.8 `garak` — canary and containment scoring

**What it does**

- A generator/probe/detector/buff taxonomy. A detector returns a score in
  [0, 1] or `None` for unassessed.
- `SystemPromptExtraction` combines system prompts from datasets with attack
  templates, then tests whether the model leaks the system prompt.
- `PromptExtraction` scores the proportion of the system prompt's character
  4-grams found in the output, with a complete-excerpt shortcut at 0.95.
- `PromptExtractionVerbatim` is the strict variant.
- `ngram_contained_match(target, context, n=4)` is a 15-line asymmetric
  containment metric: the proportion of the target's character n-grams found
  anywhere in the context.
- `StartsWith` checks whether an output begins with an expected trigger.

**What to borrow**

- The n-gram containment metric for canary reflection.
- The canary extraction attack templates as a seed for hidden-context probes.
- `None` for unassessed, never 0.
- The probe/detector separation and the taxonomy.

**What not to borrow**

- The red-team datasets, toxic-content corpora, Python CLI, or heavy
  dependencies.
- The assumption that extracting a *known* system prompt proves there is no
  *unknown* injected prompt. It does not. For hidden-context detection, combine
  canary extraction with prompt-token inflation and instruction-override probes.

**Verdict:** design reference for canary probes; reimplement the n-gram check.

### 3.9 `PyRIT` — the evidence model

**What it does**

- A message piece stores the original value and the converted value, both with
  SHA-256 hashes, plus the converter identifiers, the conversation id, the
  sequence, the timestamp, the prompt metadata, and the response error.
- A finding stores a title, description, severity, harm type, operation id,
  timestamps, and links to evidence.
- The orchestrator, converters, targets, scorers, and memory layers are built
  for multi-turn red-team campaigns.

**What to borrow**

- The original/converted pair with both hashes, so a probe can be reproduced
  after normalization or encoding.
- The converter chain identifiers.
- The finding/evidence link and the severity/state model.
- The conversation and sequence fields for multi-turn probes.

**What not to borrow**

- The attack stack, the triple-model scoring, or the multi-turn agent
  complexity for the identity lane. Most identity probes are single-turn.

**Verdict:** design reference for the evidence schema.

### 3.10 `api-relay-audit` — threat concepts, zero code

**What it does**

- A 14-step audit of an OpenAI- or Anthropic-compatible relay: hidden prompt
  injection, instruction override, prompt extraction, context truncation,
  tool-call substitution, error leakage, SSE stream integrity, infrastructure
  fingerprinting, latency variance, and upstream channel classification.
- Context truncation uses five unique `CANARY_N_<hex>` markers at evenly spaced
  intervals, then a coarse scan and binary search to find the boundary.
- Stream integrity checks five invariants: all event types belong to the known
  set; input tokens are consistent across events; output tokens are
  monotonically non-decreasing; signature deltas are non-empty; exactly one
  terminal event follows the start with no later non-ping events.
- JSON reports carry `coverage` with `skipped_steps`, `crashed_steps`, and
  `risk_matrix_inconclusive_steps`.
- The docs state the rule plainly: "Skipped probes are not evidence of clean
  behavior. A connectivity check has `risk_level: null` even when both chat
  formats respond successfully."
- "Inconclusive" is never treated as "clean."

**What to borrow**

- The threat taxonomy and the probe ideas: canary + binary search for context
  truncation, SSE invariants, tool-call rewriting, error leakage.
- The coverage-first report shape.
- The rule that a skipped or crashed probe is not a pass.
- The descriptive risk levels and the explicit evidence boundaries.

**What not to borrow**

- Any code. The repository is AGPL-3.0-only. Reading it for concepts is fine;
  copying, adapting, or linking it into the gateway is not.
- The Anthropic-specific event names and `curl`-based transport. Our gateway is
  OpenAI-compatible and Node-native.

**Verdict:** read-only architecture reference. Zero code, zero copied text
beyond the general concepts.

---

## 4. Corrections to the Gemini report

The report is valuable as a checklist. It is not a build input in its current
form. These are the corrections that matter before a FID is written.

### 4.0 What the report gets right

- The commercial thesis: a reseller at a steep discount is presumed to be
  substituting or degrading until evidence says otherwise.
- The refusal to ship a binary "verified" badge. The claims taxonomy — public,
  admin-only, never — is the right shape.
- The isolation requirement: identity evidence must not sit in the admission or
  settlement path.
- Dated evidence, a TTL, an operator review step, and a correction process.
- "Consistent with" language instead of "authentic" or "proven."
- The recognition that `/models/[id]` is the destination every link, search
  result, and review needs.
- Cost, cadence, and legal caution as first-class design inputs.

Those are real contributions. The corrections below are about the statistics and
schema, not about the product judgment.

### 4.1 "Measured" labels are not measurements

The report marks power calculations, cost totals, JSD separations, and failure
modes as `[measured]`. No run is recorded, no raw data is cited, and the source
register misdescribes at least three repositories. The word "measured" should be
reserved for a number with a run id, a protocol hash, and a sample size. Every
other number is an assumption or a recommendation.

### 4.2 Same-model JSD is ≈ 0.14, not ≤ 0.08

The report says identical models have JSD ≤ 0.08 and sets a 0.10 "consistent"
threshold. `llm-fingerprint-detector` records the paper's same-model split-half
median at ≈ 0.140; `fpverify` records the same-origin band at 0.140 and the
cross-provider band at 0.227. A 0.10 threshold would flag a genuine model as
inconsistent in a normal deployment.

**Use instead:** a protocol-matched reference, an e-process with a calibrated δ,
and JSD as an effect size with a bootstrap confidence interval. Do not use a
fixed 0.10 or 0.20 threshold.

### 4.3 System-prompt drift is as large as a model swap

`llm-fingerprint-detector` records that changing only the system prompt can
shift JSD by ≈ 0.44–0.46. The report lists hidden-prompt detection as one vector
among many and does not make the canary and token-count gates prerequisites for
the behavioral comparison. That order is backwards.

**Use instead:** run the protocol/shape, determinism, token-count, and
canary/hidden-context gates **before** the behavioral fingerprint. If the route
does not honor the system role, or the prompt-token count is inflated beyond the
calibrated template envelope, the behavioral comparison is not interpretable.

### 4.4 SPRT "accept H0" is not verification

The report's SPRT boundaries are arithmetically correct for a simple-vs-simple
test: A = ln(0.95/0.01) = 4.554, B = ln(0.05/0.99) = −2.986. The semantics are
wrong. Failing to reject H0 is not proof of H0; it is a bounded non-rejection.
The report labels the lower boundary "Accept H0 (Route Verified)."

**Use instead:** an anytime-valid e-process. A `PASS` means "no evidence of a
shift within the budget at the given α/δ." It never means "authentic."

### 4.5 Benjamini-Hochberg on SPRT is invalid

The report says to apply BH across all m evaluated hypotheses with p-values, but
SPRT produces a likelihood ratio, not a p-value, and the report never says where
the p-values come from. BH cannot be applied to e-values.

**Use instead:** per-route α = 0.01 for the primary guarantee, and either a
Bonferroni α/m correction or an e-BH procedure for a catalog-wide false-mismatch
bound. If p-values are used, they must come from a valid test (for example, a
permutation test), not from the e-process.

### 4.6 "Exact tokenizer alignment" is not observable for closed models

The report promises "exact byte-level tokenizer alignment" and "tokenizer
byte-to-token mappings." An OpenAI-compatible API exposes `usage.prompt_tokens`
and sometimes `prompt_tokens_details`; it does not expose token IDs. For
open-weight models we can run the official tokenizer locally. For GPT models we
can use `tiktoken` as an approximation. For Claude, Anthropic does not publish
a general local tokenizer comparable to `tiktoken`; the API's reported count is
the only authority. The serving engine's chat template can add 3–12 tokens or
more, and the exact overhead varies by engine and version.

**Use instead:** a **token-count consistency** probe. Compare the reported
prompt tokens to a local tokenizer count plus a calibrated per-family template
envelope ε. Report the Δ distribution and the envelope. Call it "count
consistency," not "exact tokenizer alignment." For closed models without a
tokenizer, compare the target's Δ to a protocol-matched reference's Δ; do not
claim absolute exactness.

### 4.7 The cost arithmetic is inconsistent with the probe battery

The report claims 3,076 target requests and 583,308 tokens for 44 models. That
is 69.9 requests and 189.6 tokens per model. The same report's detection matrix
includes 8,192–32,768-token needle probes. One 32k-token probe per model across
44 models is 1,441,792 tokens, before filler or controls. The total cannot be
583,308.

**Use instead:** compute cost from the actual battery: requests per model ×
tokens per request × the upstream rate card, plus control queries. Measure the
first full sweep and publish the receipt. Do not assert a total before the run.

### 4.8 The schema lacks the fields that make evidence reproducible

The proposed `identity.samples` table records HTTP status, token counts,
response body, response hash, top logprobs, and latency. It does not record the
protocol id, the probe-set SHA, the system-prompt hash, the sampling parameters,
the feature set actually allowed by the provider (logprobs vs text-only), the
cached-token count, or the coverage object.

**Use instead:** add those fields, and make `protocol_id`, `probe_sha256`,
`feature_set`, and `coverage` non-null on every run. A sample without a protocol
is not evidence; it is a response.

### 4.9 The same-model control is circular if it comes from the upstream

The report says the reseller's upstream is never used to calibrate the
reference, but its `identity.runs` requires a `same_control_id` and a
`diff_control_id` for every run. For a model served only by the upstream, there
is no non-circular same-model control. The report does not resolve this.

**Use instead:** allow `same_control_id` and `diff_control_id` to be nullable,
with a `coverage_reason`. If no trusted reference exists, the run can produce
`consistency_only` or `unsupported`, never `verified_for_tested_claims`. Do not
invent a control to satisfy a NOT NULL constraint.

### 4.10 "100% detection" is not a meaningful acceptance criterion

The report requires "100% detection on the known substitution set." With a small
labeled set, 100% observed detection is compatible with a wide confidence
interval. It also invites overfitting to the known cases.

**Use instead:** a lower confidence bound on TPR (for example, Wilson 95% lower
bound ≥ 0.90) over at least 20 positives per failure class, plus a held-out set
that was not used to tune the detector. Report the upper bound on FPR from the
control comparisons. Never claim 100%.

### 4.11 Quantization is "consistent with," not "proven"

The report says quantization is "provable where endpoints expose unmasked top-k
log probabilities." Logprobs can be rounded, filtered, recomputed, or suppressed.
Many OpenAI-compatible chat endpoints do not return top-k logprobs at all. A
text-only comparison can miss mild quantization entirely because the top-1
answer is often unchanged.

**Use instead:** label the logprob result "consistent with the reference
distribution" and record the feature set. If logprobs are absent, say
`feature_set = text_only` and lower the confidence; do not infer quantization
from text alone.

### 4.12 Stream model identity is self-reported

The report treats the model field in the stream as evidence. A proxy can rewrite
it. It is a consistency signal, not proof.

**Use instead:** check that the model field is stable across the stream and
consistent with the request, and report it as a consistency check. Do not use it
as the identity verdict.

### 4.13 Bun is not the gateway runtime

The report specifies a Bun daemon. The gateway is Next.js 16 on Node ≥ 22.18.0
with `better-sqlite3` and a Postgres cutover in progress. Adding Bun creates a
second runtime, a second lockfile, and a second deployment path for no benefit.

**Use instead:** Node and TypeScript. Use `better-sqlite3` for the current store
and the Postgres adapter after the cutover. If the worker needs to run outside
Next.js, run it as a Node script with the same modules.

### 4.14 The Postgres schema assumes a cutover that is still in progress

The report creates `identity.*` in Postgres and a `gateway_identity_worker`
role. The gateway is currently SQLite-based; the Postgres cutover is an active
FID. Creating identity tables in Postgres before the cutover completes creates a
dual-database window and a second source of truth.

**Use instead:** sequence the identity schema after the cutover. In the
meantime, the calibration lab and the identity core can run with in-memory or
SQLite fixtures. Do not ship a production identity table on a database the
gateway does not yet own.

### 4.15 A 14-day TTL may be too long for fast-moving families

A reference that is 14 days old can be stale for a frontier model that received
a silent checkpoint update. The report does not vary TTL by family.

**Use instead:** a per-family TTL (for example, 7 days for fast-moving frontier
families, 30 days for stable open-weight families), a `last_verified_at`
timestamp, and an automatic `stale` state when the TTL expires. Re-enroll before
the expiry, not after.

### 4.16 The "first slice" skips the calibration certificate

The report's first executable slice is a Bun daemon auditing 11 free-pool routes
with tokenizer, canary, and JSD probes. It does not include a calibration
certificate. Without one, the JSD numbers are uninterpretable and the FPR is
unknown.

**Use instead:** the first artifact is the calibration lab. It runs the sealed
battery against controlled arms, measures FPR and TPR, and emits a certificate.
The production worker consumes that certificate; it does not invent thresholds.

---

## 5. What savant-code contributes

The coding-agent harness is not the identity system. It contributes patterns and
a failure corpus, not a detector.

### 5.1 Benchmark v2 — reuse the rigor, not the harness

Reusable:

- The declarative task schema: dataset, solver, scorer, metadata.
- Paired trials: the same task against the target and the reference.
- `pass@k` for capability and `pass^k` for reliability.
- Trace assertions and deterministic checks.
- Structured JSON and Markdown reports.
- Governance: a run is not a result until the report is sealed.

Not reusable:

- The coding-agent sandbox, FSM, subagent, and tool metrics.
- The `chars/4` token estimate. It fails on code, JSON, and non-Latin scripts.
- The 0.5–2.5 token-ratio acceptance envelope. It is too wide to detect a
  hidden prompt and too narrow for some legitimate templates.
- Text-hash equality as identity proof. It is a consistency check, not a
  fingerprint.

### 5.2 The identity gauntlet — five seeds, not a detector

The gauntlet's five vectors are a good starting taxonomy:

1. Token-count consistency.
2. Delimiter and chat-template behavior.
3. Deterministic output on repeated prompts.
4. Refusal behavior.
5. Positional retrieval.

Each is underpowered as a one-shot probe. The gauntlet's 25-attempt / 40k-token
/ 300s budget is a reasonable ceiling for a single route, but one probe per
vector cannot support a public claim. Convert each vector into a calibrated
probe class with a sample size, a control, and a confidence interval.

The gauntlet's advisory-only posture and dated reports are right. Keep them.

### 5.3 The 2026-09-13 audit — the labeled corpus

The audit's failure classes are the seed of the regression corpus:

- 4 model substitutions.
- 3 version swaps.
- Hidden system prompts.
- Phantom tools.
- Dead listings.

Use them as labeled positives, but record that they were third-party gateways,
not the current upstream. A detector tuned on those cases is not automatically
valid for this catalog. Add controlled local mutations (FP16 vs Q4/Q8, a small
model swap, a hidden persona, a truncated context) so the corpus has known
ground truth and can be regenerated.

---

## 6. The AIO system

### 6.1 Two lanes, one evidence store

**AIO-Q (quality)** answers: how well does the model perform on this task?

**AIO-I (identity)** answers: is this route serving the claimed model, without
hidden context, substitution, or degradation?

They share:

- The protocol/manifest registry.
- The runner and error taxonomy.
- The evidence store and report renderer.
- The reference and calibration registry.
- The operator review workflow.

They do **not** share a score. A model can be authentic and weak, or strong and
substituted. A composite number would hide the exact distinction the system
exists to expose. The public page shows two separate panels; the admin page
shows two separate evidence trees.

### 6.2 The identity battery

The battery is ordered. A failure in an early gate changes what the later gates
can claim; it does not necessarily stop the run.

| # | Gate / probe | What it tests | Metric | Decision | What it can claim |
| --- | --- | --- | --- | --- | --- |
| 1 | **Protocol/shape** | Valid OpenAI-compatible response, `choices[0]`, `usage`, `model`, `finish_reason`, tool-call schema, system-role support | Pass/fail per shape; missing fields | Fail closed: no identity run if the response is malformed | "Protocol shape verified" |
| 2 | **Determinism** | Two identical passes at T=0, 20 repeats; top-1 agreement; split-half JSD at T=1 | Agreement rate; split-half JSD | If agreement < 0.95 or split-half > 0.25, mark the route unstable; use more samples or `INCONCLUSIVE` | "Repeatable within the measured envelope" |
| 3 | **Token-count consistency** | Reported `usage.prompt_tokens` vs local tokenizer count + calibrated template envelope ε | Δ tokens per prompt; Δ distribution | Flag if Δ > ε_family or the distribution shifts; record `feature_set` | "Count consistent with the {family} reference within ε tokens" |
| 4 | **Canary / hidden context** | Random nonce canary in system and user roles; ask for verbatim repetition, summarization, instruction extraction; prompt-token inflation vs a canary-free baseline | Canary containment (n-gram); token inflation; instruction override | If the system role is ignored or the canary leaks, flag; do not run the behavioral comparison as if the prompt were clean | "No hidden system prompt detected in k canary probes" |
| 5 | **Behavioral fingerprint** | 16–40 cells (task × language), 25 samples/cell at T=1.0, max_tokens=16, fixed minimal system prompt, randomized paraphrases, shuffled queue | Per-cell JSD; e-process wealth; nearest known model; split-half | `PASS` / `FAIL` / `INCONCLUSIVE` / `BEST_MATCH` / `UNKNOWN` | "Behavioral fingerprint consistent with {model} under protocol {id}" |
| 6 | **Deterministic canaries** | 50 Bernoulli probes: arithmetic, code, factual, instruction-following, exact expected answers | Accuracy; Wilson interval | Corroborating evidence; a large drop is a mismatch signal, not proof | "Passed {n}/{m} deterministic canaries" |
| 7 | **Context integrity** | Five unique canaries at 10/25/50/75/100% of the advertised window; coarse scan + binary search | Recall count; boundary in tokens | Report the highest passing depth; flag truncation below the advertised window | "Retrieval passed at {n} tokens of {advertised}" |
| 8 | **Tool/schema conformance** | Nested JSON schema, tool-call echo, package-command echo (typosquat), phantom tools | Schema valid/invalid; exact echo; unexpected tools | Flag schema corruption or rewritten commands | "Tool calls conformed on the tested schemas" |
| 9 | **Stream integrity** | SSE event whitelist, usage monotonicity and consistency, terminal `[DONE]`, model-field stability, no post-terminal events | Invariant pass/fail | Flag any anomaly; separate from the fingerprint verdict | "Streaming integrity checks passed" |
| 10 | **Logprob / quantization** (conditional) | Top-k logprobs on a fixed probe set; top-1 agreement; JSD | JSD; agreement; feature set | "Consistent with" only; if no logprobs, `text_only` and lower confidence | "Output distribution consistent with the reference" |
| 11 | **Cache / replay screen** | T=1.0 variance collapse plus anomalously low, stable latency; `cached_tokens` | Modal share; entropy; median latency | Flag response-level replay as an integrity violation, independent of identity | "No response-level cache signature detected" |
| 12 | **Passive telemetry** | TTFT, TPS, error rates, rate-limit events | Time series | Never enters the identity verdict | Operational health only |

**Probe counts and cost.** The behavioral battery is the dominant cost: 16
cells × 25 samples = 400 one-token requests per run, plus paraphrases and
retries. The context scan is the dominant token cost: five canaries at up to the
advertised window. Schedule the behavioral battery hourly or daily; schedule the
context scan off-peak and less often. Measure the first sweep; do not assert a
cost before the receipt.

### 6.3 Statistical model

**Primary decision: e-process.**

- Reference: per-cell answer counts from a trusted, protocol-matched endpoint.
- Target: observed answers per cell.
- For each observation, update log-wealth with
  `log((1−λ) + λ·q̂(c)/p0(c)) − δ`.
- Reject H0 when wealth ≥ 1/α. At α = 0.01, that is 100.
- `q̂` uses only prior observations (previsible). The reference `p0` uses
  additive smoothing and a Good-Turing `<other>` floor.
- δ is calibrated by posterior predictive simulation: Dirichlet(reference counts
  + Jeffreys 0.5), ±8% benign drift, horizon equal to the maximum budget, the
  smallest δ that keeps the trajectory below `1/(α·margin)`, max over
  simulations × 1.3, clamped to [0.005, 0.5].
- `PASS` requires a minimum budget (at least 8 observations per participating
  cell and at least 200 total) and no rejection. `FAIL` stops early.
- The certificate records the exact α, δ, λ, smoothing, horizon, and probe hash.
  Changing any of them invalidates the certificate.

**Effect size: JSD.**

- Mean per-cell JSD, base 2, over cells with at least 10 valid samples on both
  sides.
- Bootstrap 95% confidence interval over cells or samples.
- Report the paper's bands for context (0.140 self, 0.227 cross-provider, 0.463
  different model), but do not use them as decision thresholds. Our own bands
  must be calibrated on our battery and protocol.

**Bernoulli probes: Wilson intervals.**

- Deterministic canaries, context recall, and tool conformance are Bernoulli
  trials. Report the observed rate and a Wilson 95% interval.
- A 100% observed rate on 10 trials has a lower bound around 72%; do not call it
  100% detection.

**Multiple comparisons.**

- Primary: per-route α = 0.01, enforced by the e-process.
- Catalog-wide: a Bonferroni α/m bound or an e-BH procedure for the published
  mismatch rate. Do not apply BH to e-values; if p-values are used, derive them
  from a valid test and document it.

**Calibration certificate.**

- Protocol hash, detector version, battery hash.
- Control arms: same model, same precision, varied seed and batch.
- Positive arms: at least one substitution, one quantization, one hidden prompt,
  one context truncation, one phantom tool.
- Measured FPR with a 95% upper bound; measured TPR with a 95% lower bound.
- Sample sizes and coverage.
- The exact limits: model family, hardware, engine, decoding regime, and what
  was not tested.
- No verdict without a certificate whose protocol hash matches the run.

**Minimum sample sizes.**

- Behavioral battery: 16 cells × 25 samples = 400; at least 8 comparable cells.
- Determinism: 20 repeats at T=0; 25 samples/cell at T=1 for split-half.
- Canary: 10 probes; at least 5 distinct nonces.
- Context: 5 canaries per depth; coarse scan plus binary search.
- Deterministic canaries: 50 probes.
- Tool/schema: 10 schemas, including nested JSON and a package-command echo.
- Stream: 3 streams, including one with tools and one long completion.

These are starting points. The calibration lab sets the final numbers from
measured power, not from a guess.

### 6.4 References, controls, protocol matching, and TTL

**Reference sources.**

| Source | Trust | Use |
| --- | --- | --- |
| Direct vendor API (`api.openai.com`, `api.anthropic.com`, `api.deepseek.com`, Google) | High | Hard `PASS` / `FAIL` when protocol-matched |
| Controlled local deployment (official weights, official chat template) | High for the local protocol; medium for a different serving stack | Calibration and open-weight references |
| Community reference (two independent contributors, self-audit within the noise band) | Medium | `BEST_MATCH` / `UNKNOWN`; `unverified` until independently reproduced |
| The reseller's own upstream | None for its own reference | Never used to establish the reference for that upstream |

**Protocol matching.** The protocol id covers the battery hash, the system
prompt hash, the sampling parameters, the normalizer version, and the answer
domains. A reference and a target are comparable only when the ids match. If the
target does not support the system role, the protocol must specify the fallback
(prepend the system prompt to the user message) and both sides must use it.

**Same-model control.** A protocol-matched reference for the claimed model. If
it is older than the TTL, the run is `stale`.

**Different-model control.** A reference for a known different model under the
same protocol. If the detector does not separate the target from this control,
the run is `INCONCLUSIVE` — the detector is not discriminative for this pair.

**If either control fails.** Abort to `INCONCLUSIVE`; do not publish a `FAIL`.
An upstream outage, a control drift, or a protocol mismatch is not evidence of
substitution.

**TTL.** Per family: 7 days for fast-moving frontier families, 30 days for stable
open-weight families. `last_verified_at` and `expires_at` are columns, not
conventions. An expired reference produces `stale`, not a silent `PASS`.

**Anti-poisoning.** References are hashed and signed. Community references need
two independent enrollments within the same-origin noise band before they are
marked `verified`; before that they are `unverified`. Randomized paraphrases and
nonces make a fixed replay expensive. Never accept a reference from an
untrusted party for a hard verdict.

### 6.5 Evidence and data model

Proposed Postgres schema, after the cutover. The names are provisional; the
required fields are not.

| Table | Required fields | Notes |
| --- | --- | --- |
| `identity.protocols` | `id`, `version`, `probe_sha256`, `system_prompt_sha256`, `battery_json`, `normalizer_version`, `sampling_params`, `sealed_at` | Immutable once sealed. A change creates a new version. |
| `identity.references` | `id`, `model_id`, `protocol_id`, `source_kind`, `source_uri` (no key), `collected_at`, `expires_at`, `counts_json`, `n_per_cell`, `validity_json`, `latency_json`, `signature` | `source_kind` is `direct_vendor`, `controlled_local`, or `community`. |
| `identity.calibrations` | `id`, `protocol_id`, `detector_version`, `effect_band`, `delta`, `fpr`, `fpr_upper`, `tpr`, `tpr_lower`, `n_control`, `n_positive`, `certificate_json`, `sealed_at` | `effect_band` is the JSD interpretation band, not the decision rule. No run without a matching certificate. |
| `identity.runs` | `id`, `target_model_id`, `protocol_id`, `reference_id`, `same_control_id` (nullable), `diff_control_id` (nullable), `status`, `coverage_json`, `feature_set`, `started_at`, `completed_at`, `error_class` | `coverage_reason` explains a null control. |
| `identity.samples` | `id`, `run_id`, `probe_id`, `arm`, `iteration`, `http_status`, `model_field`, `prompt_tokens`, `completion_tokens`, `cached_tokens`, `response_sha256`, `top_logprobs_json`, `latency_ms`, `error_class` | Redacted text only; no raw secrets, no customer data. |
| `identity.findings` | `id`, `run_id`, `class`, `metric`, `observed`, `threshold`, `n`, `e_value`, `p_value`, `verdict`, `evidence_json` | Orthogonal findings; no composite score. |
| `identity.verdicts` | `id`, `run_id`, `status`, `claims_supported`, `claims_unsupported`, `calibration_id`, `valid_until`, `coverage_json`, `summary` | The public projection reads from here. |
| `identity.incidents` | `id`, `target_model_id`, `run_id`, `severity`, `state`, `notes`, `quarantine`, `created_at`, `resolved_at` | State: `open`, `triaged`, `confirmed`, `false_positive`, `resolved`. |
| `identity.public_projections` | `model_id`, `status`, `claims_json`, `tested_at`, `valid_until`, `methodology_url`, `correction_url` | Read-only for the web role. |

**Isolation.**

- The worker connects as `gateway_identity_worker`, which has no privileges on
  `billing_holds`, `ledger_entries`, `api_keys`, or `user_accounts`.
- A separate pool with a hard cap of 3 connections; `statement_timeout = 3000ms`.
- The public web role can read only `identity.public_projections`. It cannot
  read `identity.samples` or `identity.findings`.
- If the identity schema is down, gateway admission and settlement continue.
- No joins between identity and billing tables. No foreign keys across the
  boundary.

**Retention and redaction.**

- Raw response bodies: store a hash plus a redacted excerpt. Do not store
  customer prompts; probes are synthetic.
- Keys: environment variables only. `source_uri` must not contain a key.
- Headers: never stored. Error bodies: truncated and redacted.
- Retention: samples 90 days; findings and verdicts indefinitely; references
  until superseded plus one year.

### 6.6 Public claims and states

**Statuses.**

| Status | Meaning | Public treatment |
| --- | --- | --- |
| `verified_for_tested_claims` | A protocol-matched reference, a valid calibration, no mismatch, adequate coverage | Green panel with the tested claims and the date |
| `inconclusive` | Controls failed, coverage inadequate, route unstable, or protocol mismatch | Gray panel; no claim |
| `stale` | Reference older than the TTL, or the last run is older than the TTL | Amber panel; "last tested" date |
| `mismatch_under_review` | The e-process rejected; human review pending | Red panel; route remains available unless the operator quarantines |
| `unsupported` | No protocol-matched reference; identity cannot be tested | Gray panel; "not testable for this route" |
| `quarantined` | Human-confirmed mismatch; route hidden or purchase disabled | Red panel; correction ledger entry |

**Public wording.**

- "Behavioral fingerprint consistent with {model} on {n} probes under protocol
  {id} (tested {date}; false-mismatch bound 1%)."
- "No hidden system prompt detected in {k} canary probes."
- "Prompt-token counts consistent with the {family} reference within {ε} tokens
  (n = {n})."
- "Context retrieval passed at {n} tokens of {advertised} advertised."
- "Streaming integrity checks passed ({k} events)."
- "Tool calls conformed on the tested schemas ({k} schemas)."

**Prohibited wording.**

- "Authentic," "genuine," "proven," "certified," "unquantized," "100% accurate."
- "Cannot be substituted," "no provider can see your data," "identical to the
  official API."
- "Verified" without the tested claims, the date, and the protocol.
- Any named competitor comparison or accusation of fraud.

**Admin-only.**

- Exact JSD, e-value, wealth trajectory, per-cell divergences.
- Model-field counts, latency distributions, error classes.
- Raw (redacted) samples and control outcomes.
- Calibration internals beyond the public certificate.

**Correction ledger.**

- Public, dated, append-only.
- Each entry: model, status before, status after, reason, evidence link,
  re-test date, operator sign-off.
- A retraction is a new entry, not an edit.

### 6.7 Admin review and quarantine

- Run detail: coverage, per-cell JSD, e-value trajectory, controls, feature set,
  errors, sample counts.
- Incident states: `open` → `triaged` → `confirmed` / `false_positive` →
  `resolved`.
- A `mismatch_under_review` verdict opens a high-severity incident and starts a
  review window (the report suggests 48 hours; make it a setting).
- Soft quarantine: hide from default catalog listings and disable purchase for
  new sessions, while preserving in-flight streams. Hard delist: human approval
  only.
- Every state change is audited: actor, timestamp, reason, evidence link.

### 6.8 The quality lane

- Task registry: dataset, solver, scorer, metadata. Reuse the inspect shape, not
  the framework.
- Scorers: exact match, regex, JSON schema, code execution (sandboxed only where
  needed), rubric (model-graded only when the rubric is stable and the grader is
  independent).
- Metrics: `pass@k` for capability, `pass^k` for reliability, paired lift
  against a reference, bootstrap confidence intervals.
- Reports: per-task and per-category, with the sample size and the exact
  protocol. No single aggregate score.
- The quality lane is separate from identity. A model can pass quality and fail
  identity, or the reverse.

---

## 7. Build path

This is the full system. The order is dependency order, not a feature
reduction. Every row is in scope; what changes between rows is what can be
truthfully claimed, not what is built.

| # | Deliverable | Why it must be here | Gate | Effort |
| --- | --- | --- | --- | --- |
| 0 | **Decision record** (this document) | The operator decisions are in §12; this document is the record | Signed decisions | S |
| 1 | **Calibration lab** | No verdict is meaningful without a measured FPR/TPR and a sealed protocol | Certificate: FPR 95% upper ≤ 0.01; TPR lower ≥ 0.90 on ≥ 20 positives per class; protocol hash | M |
| 2 | **Identity core** | Protocol, battery, normalizer, JSD, e-process, delta calibration, intervals, verdict, evidence types | Unit tests for JSD, e-process fairness, FPR under H0, power, calibration; the certificate is consumed, not invented | M |
| 3 | **Persistence** | Identity schema, roles, projections, migrations; after the Postgres cutover | Billing-isolation test; identity DB down does not affect gateway admission | M |
| 4 | **Worker** | Out-of-band runner with rate limit, retries, coverage, cache screen; CLI and scheduled run | Full sweep on the free-pool models; measured cost and runtime; zero operator credit spend | M |
| 5 | **Admin review** | Evidence viewer, incidents, quarantine, audit log | Mismatch drill; control-aging drill; operator sign-off | M |
| 6 | **Free-pool shadow/publish** | Free-pool models; paid models only when funded; measure coverage, cost, FPR, TPR; operator review before publication | Coverage ≥ 95% on the free pool; documented unsupported routes; no operator-funded paid sweep | L |
| 7 | **Public model page** | `/models/[id]` with the identity and quality panels; methodology page; status states | HTTP suite; copy audit against the claims matrix; no prohibited wording | M |
| 8 | **Publish results** | `/models/[id]` advisory results for the free pool; user-funded reports; methodology; monitoring; correction ledger | Public methodology reviewed; legal checklist signed; correction path tested; no automated gate | M |
| 9 | **Quality lane** | Task registry, scorers, `pass@k` / `pass^k`, paired trials, CIs; separate score | Task suite; measured lift; no composite with identity | L |
| 10 | **Continuous operations** | Schedule, TTL, re-enrollment, drift detection, quarterly calibration review | Freshness SLO; stale-state drill; incident review | S/M ongoing |

The calibration lab is not an MVP. It is the first dependency. The production
worker, public page, quality lane, and continuous operations are all in scope.
The probe and evidence model are model-agnostic. The operator decisions in §12
set the published set to the free pool first; paid models are run only when a
user or sponsor funds the run. There is no operator-funded 75-model sweep.

---

## 8. Acceptance gates

| Gate | What must be true | Evidence |
| --- | --- | --- |
| **Calibration** | FPR 95% upper bound ≤ 0.01 on ≥ 400 control comparisons; TPR 95% lower bound ≥ 0.90 on ≥ 20 positives per failure class; protocol hash matches the run | Certificate JSON, raw counts, recomputation script |
| **Labeled corpus** | ≥ 20 positives per API-reproducible failure class (substitution, version swap, hidden prompt, context truncation, phantom tool); quantization requires a funded ground-truth run; a held-out set not used for tuning | Corpus manifest, labels, run reports |
| **Determinism** | Repeatability measured at T=0; unstable routes marked; split-half JSD recorded at T=1 | Determinism report per model |
| **Free-pool sweep** | All free-pool routes with a trusted reference; coverage ≥ 95%; measured runtime and cost; zero operator credit spend | Sweep report, cost receipt, quota reconciliation |
| **Mismatch drill** | A simulated mismatch produces `mismatch_under_review`, an incident, a notification, and a public state change; a human can confirm or clear it | Drill transcript, incident record, correction entry |
| **Control aging** | An expired reference produces `stale`, not `PASS` | Drill transcript |
| **Billing isolation** | The worker role cannot read billing tables; the identity schema can be taken down without affecting admission or settlement | Role test, kill test, reconciliation |
| **Public copy** | Every public claim maps to a test, a protocol, a date, and a sample size; no prohibited wording | Claims matrix, copy audit |
| **Legal** | Provider ToS reviewed for every probed route; FTC substantiation file complete; no named competitor audits | Legal checklist, ToS notes |
| **Quality lane** | Task suite, `pass@k` / `pass^k`, paired lift, confidence intervals; no composite with identity | Quality report |

A green build does not satisfy any of these. They are evidence gates, not
compilation gates.

> **Amended by §12.7.** The free-pool gate uses free quota and publishes
> advisory results. Any paid-model sweep is a separate funded run under §12.7.

---

## 9. Legal, security, and provider-relations checklist

**Licenses.**

- `api-relay-audit` is AGPL-3.0-only. Read it for concepts; do not copy, adapt,
  or link the code. Keep it out of the dependency graph and out of the source
  tree.
- The other nine are MIT or Apache-2.0. Reimplementing an algorithm is fine;
  copying code requires the notice. This review recommends reimplementation for
  all of them, with attribution to the paper and the repository in the
  methodology page.

**FTC substantiation.**

- Every public claim must be supported by dated, reproducible evidence.
- Do not call the evidence page "independent" or "unbiased." It is first-party
  evidence, clearly labeled.
- Publish the methodology, the limits, and the correction process.
- Do not use testimonials, reviews, or badges that imply a guarantee the tests
  do not support.

**Lanham Act / disparagement.**

- Descriptive language only: "behavioral fingerprint shifted," "not consistent
  with the reference."
- No named competitor audits, no "fraud," "fake," or "lying."
- A public mismatch finding goes through human review before publication.

**Provider terms of service.**

- Ordinary requests, within rate limits, no evasion.
- Canary extraction, instruction-override probes, and context scanning may be
  considered adversarial by some providers. Review the terms for each route;
  exclude a route from public claims if its terms prohibit the probe.
- Never probe with customer data or customer keys.
- Record the ToS review date and the reviewer.

**Privacy and secrets.**

- Probes are synthetic; no customer prompts or completions enter the identity
  store.
- Response bodies are hashed and redacted; headers are never stored.
- Provider keys live in `.env.local` only; the registry stores the variable name.
- The public projection contains no raw samples.

**Security.**

- The worker is out-of-band; it cannot block admission or settlement.
- The worker role is least-privilege; the pool is capped; the statement timeout
  is short.
- The public web role reads only the projection table.
- The admin review actions are audited.

---

## 10. Decisions required from the operator

> **Answered 2026-11-01.** The operator's decisions are in §12. The table below
> is the pre-decision record.

| # | Decision | Options | Recommendation | Why |
| --- | --- | --- | --- | --- |
| 1 | **Advisory or gate** | Public advisory only; soft quarantine; hard gate | Advisory public labels + soft quarantine after human review | A false public accusation is the dominant risk; a hard gate turns a detector bug into an outage |
| 2 | **Public scope at launch** | Free-pool only; all 44; per-family | Whatever the evidence supports; do not label a route `verified` without a protocol-matched reference | The claim, not the model count, is the constraint |
| 3 | **Reference sourcing** | Direct vendor accounts; controlled local; community | Direct vendor for every family we can; controlled local for open-weight; community only for `BEST_MATCH` | Hard verdicts need trusted, protocol-matched references |
| 4 | **Calibration hardware** | Local GPU; rented GPU; CPU-only small models | Local or rented GPU for the calibration arms; CPU small models for CI smoke tests | Quantization arms need real inference; the certificate must be regenerable |
| 5 | **TTL per family** | 7/14/30 days | 7 days for fast-moving frontier; 30 days for stable open-weight | A stale reference is worse than no reference |
| 6 | **Public detail** | Status only; status + JSD; full evidence | Status + effect size + date + protocol; raw evidence admin-only | Enough to be checkable, not enough to invite gaming |
| 7 | **Quality lane visibility** | Public; admin-only | Public, separate from identity | It is useful to customers and does not weaken the identity claims |
| 8 | **Mismatch sign-off** | Operator only; delegated reviewer | Operator only for public findings; delegated for triage | The public correction is the liability |
| 9 | **Competitor audits** | Yes; no | No | Lanham Act exposure; the system is for our own catalog |
| 10 | **Budget cap** | Fixed monthly; per-sweep; uncapped | Fixed monthly with a per-sweep alarm | Probe and control costs must be bounded before launch |

---

## 11. Source manifest

All snapshots were taken 2026-11-01 from the default branch. No commit SHA is
available because the trees have no `.git` history. License text was read from
each tree's own `LICENSE` file.

| Project | URL | License | Branch | Files inspected | Borrow / reject |
| --- | --- | --- | --- | --- | --- |
| `llm-fingerprint-detector` | https://github.com/ToseaAI/llm-fingerprint-detector | MIT | `main` | `README.md`, `src/battery.ts`, `src/constants.ts`, `src/api.ts`, `src/sampler.ts`, `src/http.ts`, `src/stats.ts`, `src/verdict.ts`, `src/reference.ts`, tests | Borrow battery shape, normalizer, JSD, split-half, protocol id, retry/error taxonomy. Reject fixed thresholds and bundled references. |
| `kvprobe` | https://github.com/nickharris808/kvprobe | Apache-2.0 | `main` | `README.md`, `src/kvprobe/detector.py`, `src/kvprobe/probe_set.py`, `src/kvprobe/cli.py`, `src/kvprobe/data/detector_calibration.json`, `CLAIMS-MAP.md`, tests | Borrow calibration-certificate gate, sealed probe hash, control-arm discipline, descriptive verdict. Reject stale numbers and the self-consistency-only CLI as substitution proof. |
| `fpverify` | https://github.com/Mohamed7415/fpverify | MIT | `main` | `fpverify/betting.py`, `calibrate.py`, `distance.py`, `endpoints.py`, `fingerprint.py`, `verifier.py`, `library.py`, `normalize.py`, `probes.py`, `screens.py`, `refs/README.md`, tests | Borrow e-process, delta calibration, Good-Turing floor, protocol matching, verdict ladder, cache screen. Reject the Python implementation and community references as ground truth. |
| `LLMmap` | https://github.com/pasquini-dario/LLMmap | MIT | `main` | `README.md`, `LLMmap/llm.py`, `LLMmap/inference.py` | Borrow open-set framing, template awareness, discriminative query selection. Reject the PyTorch classifier and the 2024 model set. |
| `inspect_ai` | https://github.com/UKGovernmentBEIS/inspect_ai | MIT | `main` | `src/inspect_ai/scorer/_scorer.py`, `_metric.py`, `_metrics/std.py`, `_eval/registry.py`, `_eval/task/run.py`, `_util/retry.py` | Borrow task/scorer registry, `Score` contract, Wilson/bootstrap intervals, retry taxonomy, structured logs. Reject the framework dependency. |
| `lm-evaluation-harness` | https://github.com/EleutherAI/lm-evaluation-harness | MIT | `main` | `lm_eval/api/model.py`, `lm_eval/filters/`, `lm_eval/models/utils.py` | Borrow the rolling-loglikelihood contract and tokenization discipline. Reject PyTorch/Transformers and the benchmark suite. |
| `promptfoo` | https://github.com/promptfoo/promptfoo | MIT | `main` | `src/types/index.ts`, `src/assertions/assertionsResult.ts`, `src/providers/` | Borrow declarative assertion shape and `not-` semantics. Reject the CLI/UI footprint and weighted composite scores. |
| `garak` | https://github.com/NVIDIA/garak (register lists `leondz/garak`, which redirects) | Apache-2.0 | `main` | `garak/probes/sysprompt_extraction.py`, `garak/detectors/sysprompt_extraction.py`, `garak/probes/leakreplay.py`, `garak/detectors/leakreplay.py`, `garak/resources/matching.py`, `garak/detectors/base.py` | Borrow canary extraction, n-gram containment, `None` for unassessed. Reject the red-team datasets and Python CLI. |
| `PyRIT` | https://github.com/microsoft/PyRIT | MIT | `main` | `pyrit/models/messages/message_piece.py`, `pyrit/models/finding.py`, `pyrit/prompt_normalizer/prompt_normalizer.py` | Borrow original/converted hashes, converter chain, finding/evidence link. Reject the attack stack and multi-turn complexity. |
| `api-relay-audit` | https://github.com/toby-bridges/api-relay-audit | **AGPL-3.0-only** | `master` | `README.md`, `docs/query-families.md`, `docs/json-report.md`, `audit.py` (step headings, context scan, stream integrity) | Read-only threat concepts: canary + binary search, SSE invariants, tool-call rewriting, error leakage, coverage semantics. **Zero code.** |

**Register corrections.**

- `garak` moved to `NVIDIA/garak`; the `leondz/garak` URL redirects. Record the
  canonical URL in the source manifest.
- `kvprobe`'s register entry claims Merkle root evidence logging. The shipped
  code has no Merkle implementation. The README mentions a signed Merkle root
  held in a private monorepo.
- `fpverify`'s register entry says "SPRT stopping boundary rules." The code uses
  a betting e-process. The correct description is "anytime-valid e-process with
  a calibrated tolerance."
- The register's "last commit/release" and "maintenance signal" columns are
  unverified because the snapshots have no history.

---

## 12. Operator decisions and revised scope (2026-11-01)

These decisions supersede the open decisions in §10 and the build path in §7
where they conflict. The review in §§1–9 remains the evidence basis; this
section changes the product surface and the cost model.

### 12.1 What the operator decided

| # | Decision | Consequence |
| --- | --- | --- |
| 1 | **Advisory only; no automated gate** | Mismatch results are published as advisory. A human may delist or quarantine; the eval never blocks a request. |
| 2 | **Admin-run, operator-published** | The operator starts the run, reviews the evidence, and publishes it. The public surface is read-only results, not a self-serve benchmark runner. |
| 3 | **Free-pool models first** | The operator-run schedule covers the free-pool routes across the registered providers. Paid/frontier models are run only when someone funds the run. |
| 4 | **API-only, no local hardware** | Probes and references are collected through APIs. Calibration is API-based. No local FP16/Q4 arms. |
| 5 | **No operator-funded full-catalog benchmark** | The operator does not pay to benchmark 75 models. The free-pool run uses free quota/credits. Paid runs are user-funded or sponsor-funded. |
| 6 | **User-initiated runs are an option** | A user can request a run for a model; the user funds it (credits or their own API key). The report is shareable. This is a feature, not a default. |
| 7 | **Quality lane follows the same delivery** | Admin-run quality results, published; no public self-serve quality benchmark. |

### 12.2 What the product is now

- **Admin console:** create a run for one model or the free-pool set; see
  progress, coverage, and cost estimate; review evidence; publish or unpublish.
- **Public model page:** published advisory results with date, protocol, sample
  size, claims, limits, and a “request a benchmark” link where offered.
- **User-funded run:** choose a model, see an estimate, pay from credits or
  supply an API key, receive a shareable report. The operator approves
  publication.
- **No public runner:** there is no page where any visitor can launch a
  75-model benchmark on the operator's account.

The probe battery, evidence model, and statistical rules in §§6.2–6.5 stay.
The delivery and the cost model change.

### 12.3 Reference sourcing, in plain language (answer to question 3)

A **reference** is a fingerprint of the model collected from an endpoint you
trust. To say “this route behaves like model X,” you need that reference. The
question was: which official API accounts do we fund to collect references?

The answer under the new scope: **none by default.** We use, in order:

1. A free or known-good endpoint that serves the same model — another provider,
   a free pool, or a published reference.
2. A published/open reference, if its protocol matches.
3. The upstream itself, but then the result is **self-consistency only**, not
   independent verification.
4. No trusted reference → publish only integrity checks, and mark the identity
   claim `unsupported`.

We do not need to buy official accounts for all 75 models. We need to record
which models have a trusted reference and which do not, and never label the
second group `verified`.

### 12.4 API-only calibration and the claim ceiling

Without local FP16/Q4 arms, the calibration certificate can cover:

- Same-model repeatability at T=0 and T=1.
- Same-model cross-provider noise, if two trusted endpoints serve the model.
- Different-model separation, if a known different model is available.
- Protocol effects: system prompt, language, sampling parameters.
- FPR for the behavioral-consistency decision on those controls.
- TPR for the failure classes we can reproduce through APIs: substitution,
  version swap, hidden prompt, context truncation, phantom tool.

It cannot cover:

- Weight-level quantization (FP16 vs Q4/Q8) without a controlled ground-truth
  deployment or a logprob reference.
- “Authentic weights” or “unquantized” claims.
- A TPR for a failure class we cannot reproduce.

Public claims therefore stop at **behavioral consistency** and **integrity
checks**. Quantization is “not tested” unless a funded ground-truth run exists.
This is a narrower claim than the report's, but it is the truthful one for an
API-only system.

### 12.5 Cost model

| Run | Who pays | Scope | Cadence |
| --- | --- | --- | --- |
| Operator-run free-pool | Free quota/credits; $0 out of pocket | Free-pool routes with a trusted reference | Daily or weekly, as quota allows |
| Operator-run paid model | Not offered by default | One model, only when a sponsor or the operator funds it | On demand |
| User-requested run | The user: credits or their own API key | One model or a small set | On demand |
| Full-catalog sweep | Nobody today | 75 models | Not offered |

The estimate is shown before the run: requests × tokens × upstream rate, plus a
margin. The run is rejected if the estimate exceeds the user's balance or the
operator's cap.

### 12.6 Revised build path

1. **Admin-run core** — protocol, battery, normalizer, evidence, verdict,
   admin run creation. No public runner.
2. **Free-pool runner** — collect references from free or known-good endpoints;
   run the battery; publish advisory results.
3. **Admin review and publish** — evidence viewer, publish/unpublish, correction
   ledger.
4. **User-funded run** — estimate, credits or API key, out-of-band execution,
   shareable report; operator approval to publish.
5. **API-based calibration** — self-consistency, cross-provider noise,
   different-model separation, protocol effects; certificate with limits.
6. **Quality lane** — admin-run tasks, published; same delivery.
7. **Continuous** — free-pool schedule, TTL, re-enrollment, stale state.

Steps 1–3 are contracted in
[`dev/fids/FID-2026-1101-087-model-identity-verification.md`](../../dev/fids/FID-2026-1101-087-model-identity-verification.md);
steps 4–7 receive their own records.

### 12.7 Revised acceptance gates

- An admin run creates a published report with coverage, cost, and limits.
- The free-pool run completes within free quota; no operator credit spend.
- A user-funded run rejects when the estimate exceeds the balance.
- A published result carries the protocol, date, sample size, claims, limits,
  and the advisory label.
- A model without a trusted reference is `unsupported` or `self_consistent`,
  never `verified`; the panel says identity is not independently verified.
- No quantization or weight-authenticity claim without a funded ground-truth
  run.
- No automated gate and no request blocking.

### 12.8 What remains open

- Which free providers and free models are in the first published set.
- The price and margin for a user-funded run (cost pass-through plus margin).
- Whether user-funded reports are public by default or only shared by the user.
- The cadence that fits the free quota.

---

## Appendix A — Proposed module map

All paths are proposals; the 400-line ceiling applies to `app/`,
`components/`, `config/`, and `lib/`.

```text
lib/identity/
  protocol.ts          # protocol id, manifest hashing, versioning
  battery.ts           # tasks, paraphrases, system prompts, cells, domains
  normalize.ts         # answer normalization and validity categories
  stats/
    jsd.ts             # JSD, entropy, per-cell comparison
    betting.ts         # e-process, wealth, previsible estimator
    calibration.ts     # delta, FPR/TPR, posterior predictive simulation
    intervals.ts       # Wilson, bootstrap, rule of three
  probes/
    shape.ts           # protocol/shape gate
    determinism.ts     # T=0 agreement, split-half
    tokenizer.ts       # token-count consistency
    canary.ts          # hidden context, n-gram containment
    context.ts         # canary + binary search
    tools.ts           # schema and command echo
    stream.ts          # SSE invariants
    logprobs.ts        # conditional distribution comparison
    cache.ts           # response-level replay screen
  evidence.ts          # run/sample/finding/verdict types
  verdict.ts           # decision ladder, claims, coverage
  references.ts        # trusted references, TTL, source kinds
  worker.ts            # out-of-band runner, rate limit, retries
```

No runtime dependency on the ten reference repositories. The only shared
external dependency is the existing gateway stack.

## Appendix B — What we reimplement, and why

| Piece | Source of the idea | Why reimplement |
| --- | --- | --- |
| JSD and entropy | `llm-fingerprint-detector`, `fpverify`, `kvprobe` | Small, testable, no dependency; we need our own normalization and cells |
| E-process | `fpverify` | The decision rule must match our reference model and calibration |
| Delta calibration | `fpverify` | The exact simulation and clamps must be ours and sealed |
| Battery and paraphrases | `llm-fingerprint-detector`, `fpverify` | The protocol is the asset; it must be ours and hashed |
| Normalizer | `llm-fingerprint-detector`, `fpverify` | The answer domains are ours; normalization errors are a major FPR source |
| N-gram containment | `garak` | 15 lines; reimplement with tests |
| Wilson/bootstrap | `inspect_ai` | Standard statistics; implement with tests |
| Assertion shape | `promptfoo` | We need the shape, not the CLI or the composite weighting |
| Evidence model | `PyRIT`, `inspect_ai` | We need the fields, not the frameworks |
| Threat concepts | `api-relay-audit` | AGPL; concepts only, zero code |

## Appendix C — Claims matrix

| Claim | Public | Admin | Never |
| --- | --- | --- | --- |
| Family/version consistency | "Behavioral fingerprint consistent with {model} under protocol {id}, tested {date}." | Exact JSD, e-value, per-cell divergence, n. | "Authentic," "genuine," "proven." |
| Hidden context | "No hidden system prompt detected in {k} canary probes." | Canary containment scores, token inflation, probe text. | "No provider can inject anything." |
| Tokenizer | "Prompt-token counts consistent with the {family} reference within {ε} tokens." | Δ distribution, tokenizer version, template envelope. | "Exact tokenizer match" for closed models. |
| Context | "Retrieval passed at {n} tokens of {advertised} advertised." | Boundary search, recall per depth. | "Full context guaranteed." |
| Quantization | "Output distribution consistent with the reference (logprobs available)." | JSD, top-1 agreement, feature set. | "Proven unquantized." |
| Streaming | "Streaming integrity checks passed ({k} events)." | Event types, usage sequence, model field. | "Untamperable stream." |
| Tools | "Tool calls conformed on the tested schemas ({k} schemas)." | Schema validation, echo exactness, unexpected tools. | "No tool rewriting possible." |
| Overall | One status per lane, with the tested claims and the date. | Full evidence tree. | A single composite trust score. |

## Appendix D — Protocol v1 candidate battery

This is the candidate for the calibration lab, not a sealed protocol. The lab
seals the final manifest, computes its SHA-256, and records the exact system
prompt, sampling parameters, normalizer version, and answer domains. Do not
start a production run against this table before that seal exists.

| Task | Answer domain | Why it is in the battery | Source |
| --- | --- | --- | --- |
| Random number 1–100 | Integer 1–100 | Strongest cross-model separator in the published batteries | `llm-fingerprint-detector`, `fpverify` |
| Random number 1–10 | Integer 1–10 | Low-entropy cell; exposes small distribution shifts | `llm-fingerprint-detector`, `fpverify` |
| Random letter A–Z | Single letter | Tokenizer- and sampling-sensitive | `llm-fingerprint-detector` |
| Random color | Single word | Wide answer space; normalizer-heavy | `llm-fingerprint-detector`, `fpverify` |
| Coin flip | `heads` / `tails` | Two-outcome cell; easy to validate | `llm-fingerprint-detector`, `fpverify` |
| Random animal | Single word | Moderate answer space; family differences | `llm-fingerprint-detector` |
| Random city | Single word | Geographic and cultural bias; useful separation | `llm-fingerprint-detector`, `fpverify` |
| Favorite number | Integer 0–10,000 | Open-ended; model-specific biases | `llm-fingerprint-detector` |

**Candidate parameters:** 8 tasks × 2 languages (English, Chinese) = 16 cells;
25 samples per cell = 400 requests per run; `temperature=1.0`; `max_tokens=16`;
fixed minimal system prompt per language; paraphrases drawn at random; request
queue shuffled; concurrency 4; retries on 429/5xx/timeout; error samples
excluded from distributions but counted in coverage. The calibration lab may add
Russian and Arabic if the pilot shows they add separation without adding
normalization noise.

**What this battery cannot do:** it is a behavioral fingerprint, not a
capability benchmark. It does not measure coding, reasoning, tool use, or
long-context quality. Those belong to the quality lane. It also cannot prove
quantization without logprobs, and it cannot prove the absence of a hidden
prompt without the canary and token-count gates.
