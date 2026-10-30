# FID: Provider usage fidelity and exact billing semantics

**Filename:** `FID-2026-1030-050-usage-and-billing-fidelity.md`
**ID:** FID-2026-1030-050
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — extend existing usage/pricing and protocol adapters.
**Archived:** 2026-10-30 — implementation `945c729`; receipt above from that tree.

## Summary

Map actual provider billing fields to separately stored upstream cost, customer
charge and weighted entitlement consumption. Preserve exact micro-dollar math;
an estimated fallback must never masquerade as provider-reported usage.

## Environment

`lib/gateway-settle.ts`, `lib/pricing.ts`, `lib/providers/anthropic-response.ts`,
stream adapters and `lib/store/usage.ts`; existing money and translation tests.

## Detailed Description

### Problem / expected behavior / root cause

`readUsage` extracts prompt/input and completion/output counts; cost uses static
per-model rates. Provider-billed weighted/cached/reasoning/tool components need
an explicit contract. Missing/invalid fields must remain distinguishable from a
real zero. Customer price, upstream debit and allowance weighting are not one value.

### Evidence

`lib/gateway-settle.ts` computes cost and sell charge separately and falls back
to prompt/character estimates. `docs/launch-readiness.md` calls out exact
`usage.cost_tokens`; current named token extraction does not retain that field.
FID-042 proves ordinary paid SSE and fault handling, not all billing variants.

## Impact Assessment

JSON/SSE adapters, stored usage schema, settlement and public/account summaries.
Risk critical: underbilling, overbilling and quota drift. 044 supplies the rate
and customer-treatment decision; preserve integer math and current ledger semantics.

## Proposed Solution

### Approach and steps

1. Capture redacted real usage shapes per enabled wire protocol and model class;
   define input/output/cached/reasoning/tool and raw/weighted count semantics.
2. Extend shared parsing and additive usage snapshots to retain actual upstream
   fields and provenance. Refuse nonfinite/negative/out-of-domain counts and
   distinguish partial usage from authoritative complete usage.
3. Compute customer charges from approved sell-price rules and upstream cost
   from its actual billing contract; avoid double-counting cached/reasoning usage.
4. Apply identical rules to JSON/SSE/fallback/cancellation; label estimates and
   expose auditable source data without customer prompts or credentials.

### Verification

Extend existing `tests/money.test.mjs`, `tests/pricing.test.mjs`,
`tests/anthropic-translate.test.mjs`; planned `tests/usage-fidelity.test.mjs`.
Fixtures assert independent expected ledger/cost/quota values across unequal
rates and partial/missing usage. Intended chain: protocol adapters → shared
usage parser/pricing → settlement → stored snapshots → financial reconciliation.

## Verification Gates

- gate: test tests/money.test.mjs
- gate: test tests/pricing.test.mjs
- gate: test tests/anthropic-translate.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the named existing files and planned `tests/usage-fidelity.test.mjs`; HTTP JSON/
SSE checks must reconcile exact amounts. Real provider field observations are
required before 062 can certify that provider's paid offering.

## Perfection Loop

RED: insufficient provider-billing fidelity proof. GREEN: explicit usage contract
and independently calculated expectations. AUDIT: pending. ADVERSARIAL: a huge,
partial or repeated usage frame must not silently become free or count twice.
Five questions: all billing classes, bounded numeric domains, hostile payloads,
centralized parsing and reproducible provenance over time.

## Re-audit and convergence (2026-10-30, post-063/048)

RED (measured in source):

- `lib/providers/anthropic-shared.ts` returns `Number(usage.input_tokens ?? 0)`
  and the same for output, so an absent counter becomes a provider-reported
  zero. `cache_creation_input_tokens` and `cache_read_input_tokens` are dropped.
- `lib/gateway-settle.ts#readUsage` accepts a payload when either total is
  present and converts the absent side to `0`; a partial frame therefore bills
  and weights as authoritative zero.
- The stream relay keeps only the last parsed usage object, so a usage frame
  carrying one component discards an earlier frame's other component.
- `usage_events` stores only `input_tokens`/`output_tokens`/`estimated`; no
  cached, cache-write or reasoning counts and no provenance survive.

GREEN (documented before code):

1. One pure parser, `lib/usage.ts`, owns provider usage: totals from
   `prompt_tokens`/`completion_tokens` (or `input_tokens`/`output_tokens`),
   subsets from `prompt_tokens_details.cached_tokens`,
   `completion_tokens_details.reasoning_tokens`, `cache_read_input_tokens` and
   `cache_creation_input_tokens`. Counts must be finite non-negative safe
   integers; a boolean, blank, negative or fractional value is absent, not zero.
2. Completeness is explicit: both totals reported is `complete`; one reported
   side is `partial`, and the missing side is estimated from the request/stream
   and labelled as such. A partial frame never yields authoritative zero.
3. Anthropic normalization stops fabricating zeros, totals processed input as
   `input + cache_creation + cache_read`, and carries the cache components.
4. Settlement stores components and provenance additively and applies the
   existing rate contract once to the total input and total output. Reasoning
   is a subset of output and cached input is a subset of input, so neither is
   added twice. Cached-rate discounts are not invented: 044 still owns rates.
5. Stream usage merges per component across frames instead of last-wins.

AUDIT: every new column is written by the single settlement path and read by
no caller that assumes a value; the parser is the only reader of provider usage
fields. Test expectations are computed independently of the implementation.

ADVERSARIAL: huge/negative/fractional/boolean counts, a usage frame with only
one side, repeated frames, and duplicate cache totals must not become free,
negative or double-counted. Ten-times-larger cached counts than input are
rejected as an out-of-domain component.

## Implementation

| Responsibility | File |
| --- | --- |
| Shared parser, merging, completeness, provenance | `lib/usage.ts` |
| Settlement applies totals once, stores components and source | `lib/gateway-settle.ts`, `lib/store/usage.ts` |
| Additive usage columns | `lib/schema/usage.ts`, `lib/db.ts` |
| JSON settlement uses the shared resolver | `lib/gateway.ts` |
| Stream usage merges per component across frames | `lib/gateway-stream.ts` |
| Anthropic normalization without fabricated zeros | `lib/providers/anthropic-shared.ts`, `lib/providers/anthropic-stream.ts` |
| Usage summaries carry provenance | `lib/types.ts`, `lib/store/shared.ts` |
| Independent expectations | `tests/usage-fidelity.test.mjs` |

## Verification

`npm run verify` exit 0 on 2026-10-30:

```text
lint: zero warnings
typecheck: exit 0
tests 259 / pass 259 / fail 0
quality: PASS (400-line ceiling, 252 files scanned)
production build: clean
http-suite: 251 checks PASS
trial-http-suite: all checks PASS
```

The nine new cases assert independent values: totals and subsets kept apart;
a single-sided frame estimated rather than zeroed; booleans, blanks, negatives
and fractions absent; out-of-domain subsets dropped; split frames merged; wholly
estimated records labelled; Anthropic cache input counted once with no invented
zero; the stream emitting only received components. Existing money, pricing and
translation suites are unchanged and pass.

Evidence limits: the production HTTP matrix reconciles exact amounts for JSON and
SSE but does not assert stored provenance per request; cached-token rate
discounts are not applied because 044 has not supplied cached rates; equivalence
with a real provider wallet debit remains 062's acceptance, as the FID states.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: track completeness/provenance per
usage component; a missing output count cannot become authoritative zero just
because an input count exists. Test partial frames and estimation independently.
Final convergence checks are in the master planning-audit receipt.

Implemented and verified. A mock with 100 input/50 output proves arithmetic, not
equivalence with an upstream wallet debit. No unknown cost is fabricated as
known zero, and no cached-rate discount is invented.

## Lessons Learned

Exact arithmetic cannot repair incorrect token categories or unverified rate inputs.
