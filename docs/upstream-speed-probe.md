# Upstream speed probe — one-day plan

Status: **tool implemented; first free-pool smoke measurement recorded; paid
comparison blocked.** Measured 2026-11-01 at 22:31 UTC. The savant-code harness
timing telemetry is implemented separately under FID-2026-1101-001 (commit
`a05aae43`, committed locally, not pushed). This is a measurement plan, not a
capacity approval and not a customer-facing claim.

The question this answers is narrow and practical: when a coding agent sends a
turn through an upstream, how long until the first token, how fast does the rest
arrive, and how often is the caller refused instead of served? It does not
measure model identity, quality, or whether the upstream serves the weights it
claims. Those belong to the AIO work and are explicitly out of scope.

## What was measured today

Six streamed requests against the Apinex free pool, paced five seconds apart,
`max_tokens: 96`, temperature 0. This is a smoke sample, not a distribution:
`p95` with two samples is just the larger value.

| Model | n | TTFT p50 / max | tok/s p50 / max | 429 |
| --- | ---: | ---: | ---: | ---: |
| `free/gpt-6-luna` | 2 | 1,039 / 1,392 ms | 187.07 / 272.20 | 0 |
| `free/gemini-3.8-flash` | 2 | 1,043 / 1,883 ms | 246.93 / 252.63 | 0 |
| `free/deepseek-v4.1-flash` | 2 | 915 / 1,369 ms | 253.66 / 256.18 | 0 |

Raw rows: [`dev/audits/2026-11-01-upstream-speed-apinex.jsonl`](../dev/audits/2026-11-01-upstream-speed-apinex.jsonl).
The response headers also reported `x-ratelimit-limit: 15` and
`x-ratelimit-remaining` counting down, which confirms the account ceiling rather
than inferring it from the panel.

Two findings already matter beyond the timings:

- **`max_tokens` was not honored.** `free/gpt-6-luna` returned 141 completion
  tokens for a request capped at 96. Treat the cap as a hint and always read the
  provider's `usage`, never assume the reservation equalled the output.
- **Short outputs inflate tok/s.** A 141-token completion is measured over a
  0.5-second generation window, so chunk batching dominates. Do not quote
  `272 tok/s` as sustained throughput; the one-day plan uses 256-token outputs
  to make the number meaningful.

## What is blocked, and why

Both upstream accounts currently refuse paid inference:

| Provider | Paid probe (`gpt-6.1-sol`, 1 token) | Result |
| --- | --- | --- |
| Apinex | `402` in 245 ms | `Insufficient balance` |
| Apixo | `402` in 138 ms | `Insufficient balance` |

Apinex exposes 21 `free/*` models; Apixo exposes none. A like-for-like free
comparison is therefore impossible, and a paid comparison needs the smallest
top-up either provider allows. Do that before spending $100 on an RPM plan: the
comparison is what decides whether the plan is worth buying at all.

The exact-credit state belongs in [`offering-evidence.md`](offering-evidence.md);
this page records only what the probe saw.

## The one-day plan

### Preconditions

1. Fund each account with the smallest top-up the provider allows. Record the
   amount and timestamp in `offering-evidence.md`.
2. Confirm the credential variable names in `.env.local`:
   `PROVIDER_KEY` for Apinex, `APIXOAI_API_KEY` for Apixo.
3. Pin the gateway commit under test and record it with the results.
4. Run the dry run first. It prints the request count and never sends anything.

```bash
node --env-file=.env.local scripts/upstream-speed-probe.mjs
```

### Guardrails

- **15 RPM per account.** The probe is sequential and paced; at the default
  five-second interval two arms stay near 6 RPM each, well under the ceiling.
- **Hard cap.** `--max-requests` defaults to 40 and refuses a larger plan.
- **No retries.** A 429 is recorded as a result, not retried away.
- **No secrets, no bodies.** Only status, timings, token counts and rate-limit
  headers are stored.
- **Stop** on any 5xx, a 402 that indicates the top-up was consumed, or a
  credential that appears in output. The last one should be impossible; if it
  happens, stop and rotate.

### Schedule

Seven rounds, two hours apart, 08:00–20:00 local:

| Round | Arms | Models | Samples | Requests |
| --- | --- | ---: | ---: | ---: |
| Each round | 2 | 3 shared ids | 3 | 18 |
| All seven | 2 | 3 | — | 126 |
| Overnight canary | 2 | 1 | 1 per 10 min | 288 |
| **Day total** | | | | **414** |

The overnight canary is there to catch a provider that degrades outside the
working day. It is one request every ten minutes per arm, far below any ceiling.

Shared ids to use: `gpt-6.1-sol`, `grok-4.7`, `deepseek-v4.1-flash`. All three
exist on both catalogs. Keep the same model set for both arms in every round;
otherwise the comparison measures the model, not the provider.

Use `--max-tokens=256` for the measurement runs so tok/s is a sustained rate
rather than a burst. Keep a separate short-output run only if first-token
latency under minimal output is the question.

### Budget

At roughly 435 input tokens (the fixed prompt) and 256 output tokens, 414
requests is about 286k tokens. At the highest shared-id rate on the current
catalog that is well under $1; confirm against the funded rate card before
running. The free-pool arm instead spends weighted allowance: a few thousand
weighted tokens per request, under 1M for the day against the 20M pool.

### Metrics

| Metric | Definition |
| --- | --- |
| `ttftMs` | Request start to the first SSE delta carrying non-empty content |
| `generationMs` | First content delta to last content delta |
| `tokensPerSecond` | Provider `usage.completion_tokens ÷ generationMs` |
| `totalMs` | Request start to stream end |
| `429 rate` | Refused requests ÷ offered requests, per arm and model |
| `gateway overhead` | Gateway `ttftMs` minus direct `ttftMs` for the same model and round |

The gateway arm needs a customer key. Pass `--gateway-url` and
`--gateway-key-env=NAME`; the key stays in the environment and never enters the
output. Use a free-group model for that arm unless the paid wallet is funded.

### Analysis

1. Report p50 and p95 TTFT and tok/s per arm and model; do not pool models.
2. Report the 429 rate separately for 200s, 4xx and 5xx.
3. Compare each gateway round with the direct round at the same time, not with
   the day's average.
4. Drop no samples silently. A timeout is a result.
5. Store the summary beside the JSONL and link both from the results note.

### Decision thresholds

These are judgment thresholds for this test, not promises to a customer:

- **p95 TTFT above 3,000 ms** on more than 10% of turns means the upstream will
  feel slow to an agent even when it is not rate-limited.
- **A 429 rate above 1%** while offering one request every five seconds means
  the published ceiling is not the ceiling the account actually gets.
- **Gateway overhead p95 above 300 ms** is a gateway problem worth profiling
  before blaming the provider.
- **Sustained tok/s below 30** makes a 1,000-token turn take more than 30
  seconds; that is the number to weigh against the plan price.

A result that fails none of these still does not prove 25 customers fit. The
concurrency ceiling (`PROVIDER_SHARED_CONCURRENCY`, default 4) is measured
separately by the load gate, not by this probe.

## Instrumenting the coding harness

The probe measures the upstream leg. To attribute a slow turn, the harness has
to record the rest: queue time before dispatch, retry waits, and the gap between
the last token and the next turn.

The savant-code trace contract already had the seam. `TraceWriter.recordEvent`
in `common/src/types/contracts/trace.ts` emits fixed-shape lifecycle events, and
`step_finished` already carried `durationMs`. Three optional fields were added
to `RuntimeTraceEvent`:

```ts
firstChunkMs?: number
retryCount?: number
retryWaitMs?: number
```

The implementation is in that repository under FID-2026-1101-001, commit
`a05aae43`. `runWithClassifiedRetry` reports every scheduled retry through an
injected `onRetry` (attempt, next attempt, delay, cumulative wait);
`processStream` calls `onFirstChunk` once on the first parsed chunk; and
`runAgentStep` emits one `phase: 'model'` `step_finished` event on success or
failure. `firstChunkMs` is request creation to the first parsed chunk, not a
strict first-visible-token measure, and `retryWaitMs` is scheduled delay, not
measured sleep time. Every field and callback is optional, so existing writers
and tests are unchanged.

That is a separate repository with its own FID gate; the change was committed
locally there and not pushed. It is not a gateway request-path change: timing
belongs in the trace, never in admission or settlement.

## How to run

```bash
# plan only, no request
node --env-file=.env.local scripts/upstream-speed-probe.mjs

# one provider, its free pool
node --env-file=.env.local scripts/upstream-speed-probe.mjs --execute \
  --arm=apinex \
  --models=free/gpt-6-luna,free/gemini-3.8-flash,free/deepseek-v4.1-flash \
  --samples=2 --max-tokens=96 --interval-ms=5000 --max-requests=10 \
  --include-usage --out=dev/audits/2026-11-01-upstream-speed-apinex.jsonl

# both providers, paid, once funded
node --env-file=.env.local scripts/upstream-speed-probe.mjs --execute \
  --arm=all --models=gpt-6.1-sol,grok-4.7,deepseek-v4.1-flash \
  --samples=3 --max-tokens=256 --interval-ms=5000 --max-requests=30 \
  --include-usage --out=dev/audits/2026-11-01-upstream-speed-paid.jsonl
```

The probe exits 1 when every request failed, so a fully blocked run is not
mistaken for a successful measurement. A partial run exits 0 and keeps the
refusals in the summary.

## Evidence boundaries

- These numbers are one moment on one network path, not a provider SLA.
- The free-pool models may be routed differently from the paid models. Do not
  transfer the free-arm TTFT to a paid route.
- The probe does not test concurrency. Four simultaneous streams are the load
  gate's question, not this script's.
- A 200 response is protocol success, not identity verification.
