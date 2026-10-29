# FID: Provider metadata integrity

**Filename:** `FID-2026-1029-014-provider-metadata-integrity.md`
**ID:** FID-2026-1029-014
**Severity:** high
**Status:** converged
**Created:** 2026-10-29
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Repair the catalog metadata prerequisites for the trial conversion recorded in
`docs/launch-readiness.md`. Preserve upstream quota weights independently of
customer access mode, support both context field spellings, and prevent missing
or invalid prices from masquerading as known zero upstream costs.

## Environment

Windows, Node, strict TypeScript, Next.js 16; base commit `be09d99`.

## Detailed Description

### Problem and expected behavior

`buildSyncedModels` zeroes every weight unless `allowFree` is true. Subscription
rows therefore lose their upstream weight. It reads only `context_window`,
although the public metadata uses `contextWindow`. `numberOrNull` converts null,
blank strings and booleans to zero, allowing an unknown cost to appear synced.
Metadata is chosen wholesale, so partial public metadata hides authenticated
fields. The adapter should normalize both sources without losing valid values.

### Root cause and evidence

`lib/providers/catalog.ts`: `const weight = isFreePool ? ... : 0`,
`String(spec.context_window ?? item.context_window ?? "")`, and
`const parsed = Number(value)`. `syncProvider` passes authenticated models and
public metadata to this function, then persists its output through replaceModels.

## Impact Assessment

### Affected Components

Provider catalog normalization/types and `tests/provider-catalog.test.mjs`.
No trial grant, payment, subscription entitlement or upstream request changes.

### Risk Level

- [x] High: inaccurate quota weights or false known-cost flags affect admission.

## Proposed Solution

1. Normalize finite nonnegative numeric price values; reject absent, blank,
   boolean, negative and nonfinite values. Explicit zero remains a known price.
   Missing output prices retain the existing symmetric-price fallback; explicit
   invalid output prices leave the row unpriced.
2. Preserve positive upstream weights for every model independently of allowFree;
   keep weight zero for paid rows with no weight and weight one for free rows
   with no valid weight. Merge metadata fields with authenticated fallbacks.
3. Accept nonblank contextWindow and context_window from either source. Keep
   the free/ prefix plus allowFree eligibility rule and zero-cost free rows.
4. Add regression tests, run full gates, verify production call path, commit,
   archive and update launch requirements with the exact receipt.

### Verification

`tests/provider-catalog.test.mjs` covers subscription weights without free access,
both context spellings/source fallbacks, invalid versus explicit-zero prices,
partial metadata, and unchanged namespacing/protocol/free sentinel behavior.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-catalog.test.mjs
- gate: quality
- gate: build
- gate: test_http
- gate: verify

## Perfection Loop

### Loop 1 — RED / GREEN

Read the adapter, types, existing tests and sync caller fully. The three
expressions quoted above establish failures. Reuse the existing adapter rather
than adding a second normalization path. Preserve existing public identifiers.

### Loop 2 — AUDIT / ADVERSARIAL

Partial metadata needs field-level fallback, not only a context fix. Explicit
zero price must remain valid; invalid negative output must not become free.
Paid weights must not imply free eligibility. Existing free access test guards
this distinction. No live credentials or real database mutations are required.

### Loop 3 — final convergence

Call graph is syncProvider → buildSyncedModels → replaceModels. Tests directly
exercise this same production builder. Changes are isolated to normalization;
trial amount and eligibility remain operator decisions. Plan converged before
implementation. Trial continuation awaits the amount response already requested.

### Missed Questions

- Does a subscription weight make a row free? No; eligibility remains separate.
- Are stored rows repaired immediately? No; corrected metadata applies on sync.
- Is this a trial implementation receipt? No; trial routing remains unfinished.

## Resolution

Implementation exists in catalog.ts/types.ts with six regression tests.
2026-10-29 `npm run verify` exited 0: lint zero warnings; typecheck passed;
113/113 tests passed; quality PASS (400-line ceiling, 191 files scanned);
51-route production build compiled successfully; http-suite: 100 checks PASS.
Manual audit confirmed syncProvider → buildSyncedModels → replaceModels and
preserved allowFree/group independence. All four steps implemented; closure
awaits the implementation commit.

## Lessons Learned

Quota metadata and customer billing modes are independent concepts.
