# FID: Persist the provider-reported cost after settlement

**Filename:** `FID-2026-1122-003-provider-cost-persistence.md`
**ID:** FID-2026-1122-003
**Severity:** medium
**Status:** converged
**Created:** 2026-11-22 21:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

> **Project application (savant-gateway).** This repository uses npm, not Bun, and it does
> **not** ship `fid:verify`, `quality:report` beyond `npm run quality`, `scope:check` or
> `validate:repository`. The gates that actually exist are declared in `protocol.config.yaml`
> and repeated below. FID closure is checked by review against this template, the gate output
> and the commit recorded in the FID.

---

## Summary

InferHub reports what a request actually cost in the final `usage` object of the response
(`usage.cost`, dollars), and the gateway throws that number away. `settleCall` prices the tokens
from our own catalog snapshot and writes `cost_micros`, so the ledger records what our price table
*believes* the upstream charged and never what it said it charged. On a marketplace whose per-model
bid is pinned in the vendor's dashboard and whose cheapest publisher can be saturated at any
moment — routing silently to a tier that costs up to 479× more — that difference is invisible
margin erosion rather than a rounding concern. This record stores the reported figure beside the
computed one and surfaces the disagreement to the operator, without changing what any customer is
charged.

## Environment

- **OS:** Windows 11, Node 22.x
- **Language/Runtime:** TypeScript strict (ESM, `.ts` extension imports), PostgreSQL via `pg`
- **Tool Versions:** npm; PGlite for the local engine
- **Commit/State:** `ac7f507` on `main`

## Detailed Description

### Problem

`readProviderUsage` (`lib/usage.ts:70-99`) reads token categories only. `ProviderUsage`
(`lib/usage.ts:15-26`) has no cost member, so the parser drops `usage.cost` before any caller can
see it. `settleCall` then computes the upstream cost from the price table
(`lib/gateway-usage.ts:143-155`) and writes it as `cost_micros`
(`lib/storage/store/usage.ts:217-247`). Nothing in the tree compares the two, and
`grep -rn "provider_cost\|providerCost" lib app components tests` returns no match.

The measured consequence is F-2 in
[`docs/research/inferhub-upstream-audit.md`](../research/inferhub-upstream-audit.md): the operator
cannot tell a 1.0× tier from a 479× one after the fact, because both settle at the same
price-table figure.

### Expected Behavior

A settled call records the provider's own reported cost when the provider sent one, keeps the
price-table figure as the billing basis, and shows the operator when the two disagree.
"Provider did not report a cost" stays distinct from "provider reported zero".

### Root Cause

The usage parser was built for a single upstream that reports tokens and nothing else. Cost is a
second, differently-typed field: fractional dollars rather than an integer count, so it did not
fit `count()` and was left out.

### Evidence

```text
$ grep -rn "cost" lib/usage.ts
(no output)

$ grep -rn "provider_cost" lib app components tests
(no output)

$ sed -n '70,76p' lib/storage/schema/core.ts
   cost_micros BIGINT NOT NULL DEFAULT 0,
   status TEXT NOT NULL,

$ sed -n '140,146p' lib/gateway-usage.ts
   return {
     costMicros:
       computeTokenCostMicros(inputTokens, model.costInputMicros) +
       computeTokenCostMicros(outputTokens, model.costOutputMicros),
```

InferHub's documented final chunk, from the authenticated capture in
`docs/research/inferhub-upstream-audit.md` §2:

```json
{"choices":[{"delta":{},"finish_reason":"stop"}],
 "usage":{"prompt_tokens":812,"completion_tokens":96,"total_tokens":908,"cost":0.0004356}}
```

## Impact Assessment

### Affected Components

- `lib/usage.ts` — the provider usage shape and its merge
- `lib/storage/gateway/settle.ts` — passes the figure to the money path
- `lib/storage/store/usage.ts` — the write and the admin read
- `lib/storage/schema/{core,billing}.ts` — the column
- `lib/projections.ts`, `lib/types.ts` — the admin row shape
- `components/admin/admin-panel.tsx` — the operator surface

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: no customer-visible behaviour changes; the risk is a stored figure that is read as
  authoritative when it is not
- [ ] Low

## Proposed Solution

### Approach

Add the reported cost to the provider usage shape as an integer in micro-dollars, carry it through
`resolveUsage`, and write it to a nullable column. The price-table `cost_micros` stays the ledger's
basis: a provider-reported number is reconciliation data, and making it the basis would move money
on a figure we do not control. The operator surface shows a marker only when the two disagree.

### Steps

1. **Parse it in the one parser.** `ProviderUsage.costMicros: number | null`, read from
   `usage.cost` (also `usage.total_cost`, which some gateways emit) with fractional tolerance,
   rounded half-up to micro-dollars (`lib/usage.ts`). A figure that is not a finite non-negative
   number, or exceeds a per-request sanity ceiling of $1,000, is absent rather than zero.
2. **Carry it, do not derive it.** `ResolvedUsage.providerCostMicros` is copied from the parse;
   `estimatedUsage` sets `null`. `mergeProviderUsage` keeps the earlier value when a later frame
   omits it, exactly like the token components.
3. **Write it.** `provider_cost_micros BIGINT` on `usage_events`, nullable, in the create-table and
   the `ensureColumn` migration (`lib/storage/schema/core.ts`, `lib/storage/schema/billing.ts`).
4. **Thread it.** `UsageSettlement.providerCostMicros` (`lib/storage/store/usage.ts`),
   passed by `settleCall` from the resolved usage (`lib/storage/gateway/settle.ts`). Both the
   streamed and buffered paths get it because both settle through `settleCall`.
5. **Read it in the admin row only.** `UsageRow.provider_cost_micros` →
   `AdminUsageSummary.providerCostMicros` (`lib/projections.ts`, `lib/types.ts`). The
   customer-facing `UsageSummary` is unchanged: our upstream cost is not a customer datum.
6. **Show the disagreement.** In the admin overview usage table, a cost cell whose reported figure
   differs from the computed one by at least one micro-dollar carries the reported value and a
   variance marker with both figures in the title (`components/admin/admin-panel.tsx`).
7. **Docs and records.** `docs/providers.md` states that this provider's reported cost is now
   persisted; CHANGELOG, SCOPE (IA5) and the register are updated.

### Verification

- `tests/usage-provider-cost.test.mjs` — the parse (number, string, fractional rounding), the
  exclusions (absent, negative, `NaN`, over the ceiling), the merge, and `estimatedUsage`.
- `tests/gateway-settlement-postgres.test.mjs` — a settlement whose usage reports a cost writes it
  to `usage_events.provider_cost_micros`, and `cost_micros` still comes from the price table; a
  settlement without one writes `NULL`, not `0`.
- The streamed path is proven in the same suite by a chunk carrying `usage.cost`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/usage-provider-cost.test.mjs
- gate: test tests/gateway-settlement-postgres.test.mjs
- gate: test tests/usage-parser.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: (filled at closure)

## Perfection Loop

### Loop 1 — RED

- **RED:** Cost arrives on the wire and is dropped. Confirmed by the absence greps above and by
  the parser's shape (`ProviderUsage`, `lib/usage.ts:15-27`), not by reading the vendor's docs
  alone.
- **GREEN:** Steps 1-7.
- **AUDIT:** Every claimed producer is real and reachable: `readProviderUsage` is called on the
  buffered path (`lib/storage/gateway/call.ts:385-389`) and on the relayed one
  (`lib/storage/gateway/stream.ts:116-120`); `resolveUsage` folds both into one resolved shape
  (`lib/usage.ts:132-160`); and `recordUsage` is the only `INSERT INTO usage_events` in the tree
  (`grep -rn "INSERT INTO usage_events" lib` → one match, `lib/storage/store/usage.ts:217`).
  A new column with no writer would fail this audit; the writer is step 4, and `settleCall` is the
  only caller of `recordUsage`, so both paths reach it.
- **ADVERSARIAL:** "Why not bill from the reported cost?" Because it is the upstream's number about
  the upstream's charge: using it as the customer's basis would let a provider change our margin by
  editing a field, and it is absent on providers that do not report it. Reconciliation, not billing.
  "Could a hostile provider send `cost: 1e12`?" The ceiling makes it absent, and nothing reads the
  value for money.
- **CHANGE DELTA:** n/a (initial record).

### Missed Questions

1. *Store dollars or micro-dollars?* Micro-dollars as `BIGINT`, matching every other money column;
   a `DOUBLE PRECISION` here would be the only float in the ledger.
2. *Is an absent cost zero?* No — `NULL`, the same rule `lib/usage.ts:1-14` sets for token counts.
3. *Should the analytics totals change?* No: aggregating a reconciliation figure into margin would
   make the margin column two different quantities. It is per-call evidence.
4. *Does the customer-facing usage list need it?* No, and it must not have it: the column reveals
   our cost basis.
5. *What if the provider reports cost on a frame we do not parse as usage?* The parser is invoked on
   every frame (`stream.ts`), and the merge keeps the first reported figure, so a final-chunk report
   survives an earlier frame without one.

### Implementation Evidence

- [ ] **Commit SHA:** (filled at closure)
- [ ] **File:line ranges:** (filled at closure)
- [ ] **Gate output:** (filled at closure)
- [ ] **Reproducibility:** (filled at closure)
- [ ] **Step statuses:** (filled at closure)

### Code Verification Evidence

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence is present for new or repaired wiring
- [ ] FID status reflects the actual implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** (filled at closure)
- **GREEN:** (filled at closure)
- **AUDIT:** (filled at closure)
- **ADVERSARIAL:** (filled at closure)
- **CHANGE DELTA:** (filled at closure)

### Loop 3 — Final convergence

- **RED:** (filled at closure)
- **GREEN:** (filled at closure)
- **AUDIT:** (filled at closure)
- **ADVERSARIAL:** (filled at closure)
- **CHANGE DELTA:** (filled at closure)

## Resolution

- **Closed Date:** (filled at closure)
- **Fix Description:** (filled at closure)
- **Tests Added:** (filled at closure)
- **Verification Evidence:** (filled at closure)
- **Archived:** (filled at closure)

## Lessons Learned

(filled at closure)
