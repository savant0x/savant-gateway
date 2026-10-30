# Session summary: provider usage fidelity (050)

**FID:** FID-2026-1030-050
**Date:** 2026-10-30
**Implementation:** `945c729`
**Branch:** `main`

## Measured defects

- `lib/providers/anthropic-shared.ts` turned an absent `input_tokens` or
  `output_tokens` into a provider-reported `0` and dropped
  `cache_creation_input_tokens` / `cache_read_input_tokens`.
- `lib/gateway-settle.ts#readUsage` accepted a payload when either total was
  present and converted the missing side to `0`.
- The stream relay replaced usage on every frame, so a later frame carrying one
  component erased the other.
- `usage_events` stored only totals and an `estimated` flag, with no cached,
  cache-write or reasoning counts and no provenance.

## Implemented contract

`lib/usage.ts` is the only reader of provider usage. Both totals reported means
`reported`; one reported side is `partial` and the other side is estimated from
the request or streamed output; nothing reported means `estimated`. Counts must
be finite non-negative safe integers, and a subset larger than its total is
discarded rather than clamped. Anthropic totals processed input as
`input_tokens + cache_creation + cache_read`, keeps both cache components, and
emits no counter it did not receive. Settlement applies the existing per-token
rates once to each total, stores the components and `usage_source`, and leaves
historical rows NULL rather than claiming provenance they never had.

## Receipt

`npm run verify` exit 0: lint zero warnings, typecheck, 259/259 tests (nine new
fidelity cases), quality PASS (400-line ceiling, 252 files), clean production
build, 251 HTTP checks, trial HTTP suite PASS. Local log
`data/050-verify.log` is an ignored receipt.

## Limits and next

Cached-rate discounts require 044's rates and are not fabricated; the stored
components make that correction possible later without re-parsing. The HTTP
matrix reconciles exact amounts but does not assert stored provenance per
request. Equivalence with a real provider wallet debit remains 062's acceptance.
With 048 and 050 in place, 051 (durable settlement, replay and crash/expired-hold
recovery) is the next dependency-ordered item. The two untracked research
documents remain the operator's.
