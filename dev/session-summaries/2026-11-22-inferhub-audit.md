# Session summary — 2026-11-22 InferHub upstream audit

## Instruction

"read single agent echo 0-end, ground yourself. Then i want you to deeply review
https://inferhub.dev/docs/api, to see if they can be another upstream provider, audit
everything and create a full report."

Automation level 3; `strict_mode: true`; single agent. Register:
[`SCOPE.md`](../../SCOPE.md), session "InferHub upstream audit: IA".

## What was produced

| Artifact | Change |
| --- | --- |
| `docs/research/inferhub-upstream-audit.md` | New. Method, live evidence, wire/catalog/settlement/operations/compliance audits, 18 findings, verdict, ordered actions. |
| `scripts/upstream-catalog-probe.mjs` | New. Read-only probe that runs the shipped normalizer over a captured `/models` payload; writes nothing. |
| `docs/providers.md` | Dated 2026-11-22 re-observation; the two claims the live surface disproved (`/api/catalog` 404, no balance endpoint) are corrected; link to the audit. |
| `docs/README.md` | Index entry for the audit. |
| `CHANGELOG.md` | Entry for this slice. |
| `SCOPE.md` | Session register: IA1/IA2 completed, IA3 blocked with named blockers. |

No application code, schema, test, provider row or price changed.

## Evidence

Captured 2026-11-22 by read-only HTTP with no credential: `docs/api`, `docs`,
`openapi.json` (OpenAPI 3.1, 79 paths), `terms`, `privacy`, `faq`, `pricing`,
`api/status`, and `GET https://api.inferhub.dev/v1/models` (200, 507 rows — public where
the 2026-11-20 record observed 403). `/api/catalog`, `/api/me` and `/v1/me/usage` answer
401 without a key.

Probe output over that payload: 507 received, 255 imported, 242 aliases and 10 media rows
refused, 0 `free/` ids refused, 116 route groups with 63 holding 2–9 rows, 153
vision-capable. Price ladder: next tier 5.76× at p90 and 480× at worst; the
50%-of-official cap holds as a ceiling on all 255 priced rows with zero violations.

## Findings that need work (not code changes made here)

1. An in-stream provider error is followed by `[DONE]`, so the relay settles `ok` and
   bills an estimate (`lib/storage/gateway/stream.ts:181-190`, `:234-249`).
2. Upstream `402 insufficient_balance` and `402 no_provider_under_bid` text is relayed to
   customers verbatim (`lib/gateway-refusal.ts:21-33`).
3. Provider-reported `usage.cost` is documented and neither read nor stored; cost basis
   stays the imported `min_ask` floor.
4. Family labels split one model line into two (`Minimax`/`MiniMax`) and mislabel others
   (`K3`, `Zai`, `Hy4flash`, `Qwen3.8`) — `lib/model-family.ts:44-52`.
5. `/api/catalog` publishes `systemPromptNote` and `activeProviders`; nothing imports it.

## Gates

```text
npm run check            PASS (eslint --max-warnings=0, next typegen, tsc --noEmit)
npm run quality          PASS (400-line ceiling, 700 files scanned)
npm run repository:check PASS (Node 24, 12 gates, 12 active FIDs)
npm run attribution      PASS (no agent credit; no governed credit line)
npm test                 tests 1191, pass 1175, fail 0, skipped 16
```

## Not claimed

No funded inference call, no observed `429 capacity_saturated` on the wire, no pinned bid,
no balance, no streaming round-trip through this gateway, and no provenance ruling.
Steps 5–7 of FID-2026-1120-001 remain blocked, and the `inferhub` row stays disabled.
