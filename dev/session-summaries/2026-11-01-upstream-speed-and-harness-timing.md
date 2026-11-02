# Session summary — 2026-11-01 — upstream speed probe and harness timing

## Scope held this session

Three connected requests:

1. A one-day plan to measure real upstream latency, tokens/second and 429 rate at
   the current 15 RPM ceiling.
2. The same probe run against Apinex and Apixo, comparing first-token latency and
   throughput.
3. Timing instrumentation in the savant-code coding harness for turn latency and
   retry stalls.

The question behind all three: will a coding agent feel slow through this
gateway, and what should be bought before spending on an RPM plan?

## Completed

### 1. Gateway measurement plan and probe

- `docs/upstream-speed-probe.md` — definitions, seven rounds plus an overnight
  canary (414 requests, about 286k tokens, under $1 at current rates), pacing,
  stop conditions, decision thresholds, and evidence boundaries.
- `scripts/upstream-speed-probe.mjs` — dry-run by default, hard request cap,
  sequential five-second pacing, no retries, no secrets and no response bodies
  stored. Reads the same `PROVIDER_KEY` and `APIXOAI_API_KEY` variables the
  gateway uses. `--gateway-url` / `--gateway-key-env` add a gateway arm.
- `package.json` — `probe:speed`.
- `docs/README.md` — index entry.
- `dev/audits/2026-11-01-upstream-speed-apinex.jsonl` — six raw rows.

### 2. Live smoke measurement

Six streamed requests to the Apinex free pool, 96-token cap, five seconds apart:
6/6 status 200, 0/6 refused. First-chunk median 915–1,043 ms; maximum 1,883 ms.
Reported throughput 187–272 tok/s, which is a short-burst number, not sustained.
Headers reported `x-ratelimit-limit: 15`.

Two findings: `max_tokens: 96` was not honored (`free/gpt-6-luna` returned 141
completion tokens), and Apinex has 21 `free/*` ids while Apixo has none, so a
free-arm provider comparison is impossible.

### 3. Paid comparison — blocked

Both paid probes (`gpt-6.1-sol`, one token) returned `402`:

- Apinex: 402 in 245 ms, insufficient balance.
- Apixo: 402 in 138 ms, insufficient balance.

The probe is ready for both arms; the comparison needs the smallest top-up each
provider allows.

### 4. savant-code harness instrumentation

Implemented under `FID-2026-1101-001`, commit `a05aae43` (local `main`, not
pushed):

- `RuntimeTraceEvent` gained optional `firstChunkMs`, `retryCount`,
  `retryWaitMs`.
- `runWithClassifiedRetry` reports each scheduled retry through an injected
  `onRetry` (attempt, next attempt, delay, cumulative wait).
- `processStream` calls `onFirstChunk` once on the first parsed chunk.
- `runAgentStep` emits one `phase: 'model'` `step_finished` event on success or
  failure; the clock starts before stream creation.

`firstChunkMs` is first parsed chunk, not strict first-visible-token; `retryWaitMs`
is scheduled delay, not measured sleep. All fields and callbacks are optional.

## Verification receipts

Gateway:

- `npm run lint` — exit 0.
- `npm run probe:speed` dry run — exit 0, no request sent.
- Live free-pool run — exit 0, 6/6 status 200, six JSONL rows, no credentials or
  bodies in the output.

savant-code:

- `bun test packages/agent-runtime/src/__tests__/stream-retry-telemetry.test.ts`
  — 2 pass, 0 fail.
- `bun run --cwd=common typecheck` — exit 0.
- `bun run --cwd=packages/agent-runtime typecheck` — exit 0.
- `bun run quality:report` — PASS (400-line ceiling, 1,490 baselined files).
- Call-graph grep confirms production callers in `step.ts`,
  `prompt-agent-stream.ts` and `stream-parser.ts`.

## Open work

1. **Fund the smallest top-up on each upstream** and run the paid comparison.
   This is the only way to answer whether Apixo is faster or slower than Apinex.
2. **Run the full 414-request day** and write the results note with p50/p95 TTFT,
   tok/s, 429 rate and gateway overhead.
3. **Gateway probe is uncommitted.** It is operator tooling under `scripts/`, not
   an application import, but it is non-trivial code and this repository expects
   a FID for that. Either add a FID before committing or record an explicit
   tooling exemption. It was not committed in this session to avoid presenting
   unfiled work as closed.
4. **The harness fields are not yet consumed.** The CLI trace viewer and eval
   report still need to read `firstChunkMs` / `retryCount` / `retryWaitMs` for
   the data to be visible; the runtime contract is in place.

## Deviations from the protocol, recorded honestly

- The gateway probe and plan were written without a FID. The script is tooling,
  not product code, but the repository's rule does not carve that out; item 3
  above is the correction.
- The live probe consumed a few thousand weighted free-pool tokens on the
  operator's Apinex account. It did not spend wallet credit; both wallets were
  already empty.
- No gateway commit was made. The savant-code change was committed locally and
  not pushed, per the no-push boundary.
- The savant-code FID record is local only because that repository ignores
  `/dev` in `.gitignore`; the tracked commit carries the code, test and
  changelog entry.
