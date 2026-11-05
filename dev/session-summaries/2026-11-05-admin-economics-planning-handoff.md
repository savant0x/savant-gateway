# Admin economics planning — verified handoff

The operator supplied a planning-only master and three children covering pricing,
provider capital, customer profitability, free-tier economics, plan simulation
and actionable alerts. This pass converged those documents through the
single-agent Perfection Loop and recorded the planning receipt. No implementation
was requested or performed, and no price, funding, payment, ledger, entitlement
or deployment changed.

## Program

Six unique items; the operator's item 4 was listed twice and denotes one
free-tier item.

| Order | FID | Ownership | Items |
| --- | --- | --- | --- |
| 1 | 005 pricing command center | Realized pricing projection, matched benchmark comparison, version-checked preview and approval | 1 |
| 2 | 006 provider capital and alerts | Balance/freshness, recorded spend, runway estimate, economic incident rules | 2, 6 |
| 3 | 007 customer and offering economics | Customer contribution, free cohorts, read-only plan simulator | 3, 4, 5 |
| — | 008 master | Item map, dependency order, shared definitions and boundaries | all |

Each child is `converged`; 008 is `converged`. None is `fixed` or `closed`:
planned test files do not exist and no application file was changed.

## Shared definitions fixed by the master

- Cross-system joins use immutable settlement source and provider identity,
  bounded UTC windows and integer micro-dollars.
- Unknown, stale, unavailable and zero are distinct states; no missing input is
  rendered or summed as zero.
- Prepaid top-ups are liabilities; plan invoice cash and earned-period estimates
  are separate series; plan overage is not counted twice.
- Recorded provider cost is an estimate, not proof of an upstream cash debit.
- Runway is balance divided by an explicit trailing burn with stated coverage;
  zero burn is not infinite runway.
- A simulated price, runway or plan is never presented as observed performance.
- No design authorizes funding, payment, price publication, deployment or an
  automatic financial write.

## What the Perfection Loop found and corrected

- `analyzed` is not an allowed active status for this repository's contract;
  all four records now carry `converged`.
- The drafts omitted the template's Environment fields, risk checklist, per-loop
  receipts, missed questions, planned test paths and five-field Resolution.
- Ownership was implicit. Each metric now has one owner: 005 pricing, 006
  provider observations and incidents, 007 customer and offering economics.
- Preview, runway and simulation needed explicit read-only guarantees and
  version/coverage checks before a coding session could treat them as contracts.
- Audit citations were added from the current tree, for example
  `lib/price-recommendation.ts:104`, `app/api/admin/pricing/route.ts:57`,
  `lib/storage/providers/runtime.ts:29`,
  `lib/storage/store/provider-rows.ts:134`,
  `lib/storage/store/activity.ts:71` and
  `app/admin/(panel)/analytics/page.tsx:64`.

## Document deltas (measured, characters)

| FID | Before | After | Delta |
| --- | --- | --- | --- |
| 005 | 5,462 | 14,364 | +163.0% |
| 006 | 5,212 | 13,261 | +154.4% |
| 007 | 6,004 | 14,191 | +136.4% |
| 008 | 6,338 | 15,205 | +139.9% |

These first-pass rewrites exceed the 10% per-pass edit cap. The drafts had none
of the required template sections, so a structural rewrite was the only way to
converge them; the deviation is recorded here rather than presented as a
compliant edit distance. The second and third loops changed no text (0% each).

## Verification receipt

Run on 2026-11-05 against baseline `b24594b` with only planning records changed:

```text
$ npm run repository:check
repository-check: PASS (Node 24, 11 gates, 17 active FIDs, root links and current docs consistent)
exit 0

$ npm run attribution
attribution-guard: PASS (no coding-agent credit found)
attribution-document-guard: PASS (no governed credit line)
exit 0

$ npm run lint
exit 0

$ npm run typecheck
✓ Types generated successfully
exit 0
```

Not run and not claimed: implementation tests, quality, build, HTTP,
PostgreSQL, recovery and load gates. They prove application behavior, and no
application behavior changed in this pass. The three planned suites
(`tests/admin-pricing-command.test.mjs`, `tests/provider-capital.test.mjs`,
`tests/customer-offering-economics.test.mjs`) are contracts for a future coding
session, not existing evidence.

## Next coding session

1. Read each child 0-EOF against the then-current tree; the baseline age is not
   a freshness guarantee.
2. Implement 005, then 006, then 007, preserving the single-owner boundaries.
3. Prove preview-only operations cannot write, unknown is never zero, and
   concurrent version changes reject stale approvals.
4. Close a child only with committed code, its declared gates and production
   call-graph evidence.

## Preservation

The pre-existing website-copy edits and the two untracked conversation exports
were not staged, edited or removed. The operator's approximately $300 remains
provider working capital, not infrastructure budget. No secret was read,
printed or committed.
