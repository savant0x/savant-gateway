# FID: Provider, catalog and benchmark integrity

**Filename:** `FID-2026-1030-055-provider-and-catalog-integrity.md`
**ID:** FID-2026-1030-055
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-047
**YAGNI-Compliance:** Verified — extend scoped sync and stored benchmark design.

## Summary

Prove catalog sync, manual operator choices and external measurements stay correct
under partial payloads, source failure, lease expiry and provider changes. Never
publish unsupported access, fabricated health/cost or a score matched to the wrong model.

## Environment

`lib/providers/sync.ts`, registry/catalog builders, model/group/pricing stores,
`lib/artificial-analysis.ts`, benchmark sync/store and public catalog projection.

## Detailed Description

### Problem / expected behavior / root cause

Additive sync and ambiguity rejection exist, but lifecycle/failure acceptance
needs deeper coverage. `fetchUpstreamModels` maps a malformed catalog to an empty
array; successful-looking empty/partial input must not silently delist everything.
Benchmarks have a leased writer and sanity checks, not guaranteed fresh measurements.

### Evidence

`lib/providers/sync.ts` obtains models and then calls `replaceModels` scoped to
slug. `lib/store/public-catalog.ts` caches display data, not billing lookup.
`lib/benchmark-sync.ts` manages intervals/lease; `lib/store/benchmarks.ts` retains
stale rows. Existing provider/benchmark tests cover pure parsing/matching.

## Impact Assessment

Provider registration/network policy, sync transaction, catalog visibility,
operator assignments/prices, measurement attribution and cache invalidation.
Risk high: wrong routing/price/access or misleading quality claims. Preserve
public `owned_by: savant-gateway`, family/group vocabulary and manual overrides.

## Proposed Solution

### Approach and steps

1. Validate authenticated/public payload contracts and distinguish verified
   empty/delisted catalogs from transport/parse/partial-source failure.
2. Prove provider isolation, manual price/group/disable preservation, duplicate
   upstream IDs, hidden versus disabled semantics and uncached billed lookup.
3. Exercise benchmark pagination/truncation, quota, interval/force behavior,
   expired leases and transactional row/sync status; retain last known good data.
4. Verify score/version/source/measurement-versus-fetch provenance and cache
   freshness labels; unmeasured remains null, ambiguous matching refuses guesses.

### Verification

Extend `tests/providers.test.mjs`, `tests/provider-catalog.test.mjs`,
`tests/model-groups.test.mjs`, `tests/benchmarks.test.mjs`; planned
`tests/catalog-integrity.test.mjs`. HTTP fixture sources test real sync/status
and production catalog projection, not only a parser. Intended callers: provider
admin sync → scoped validated store; public pages → stored projection/measurements.

## Verification Gates

- gate: test tests/providers.test.mjs
- gate: test tests/provider-catalog.test.mjs
- gate: test tests/model-groups.test.mjs
- gate: test tests/benchmarks.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the four existing named files and planned `tests/catalog-integrity.test.mjs`.
Require disposable migration/sync/failure receipts; real enabled-provider catalog
and permission/rate observations link to 044/062 without exposing keys.

## Perfection Loop

RED: insufficient whole-sync failure/identity proof. GREEN: validated source
boundaries and preserved good state. AUDIT: complete (below). ADVERSARIAL: a 200
HTML/error page or capped pagination no longer erases a good catalog, and
provenance is not overwritten. Five questions: all payload states, bounded
quota/work, hostile redirects, one stored truth and reproducible identity
matching.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: stale measurement rows keep their
own index version and observation date. A new global sync timestamp cannot
label an older row as newly measured or mix incomparable revisions silently.
Final convergence checks are in the master planning-audit receipt.

Implemented. Upstream `/models` is now read through one validated boundary:

- `lib/providers/model-list.ts` requires a JSON object with a `data` array.
  A 200 that is an error object, HTML, `null` or a differently shaped body
  throws, so it can never be mistaken for an empty catalog. An explicit
  `data: []` remains a verified empty catalog; a non-empty page with no usable
  ids also throws instead of delisting everything.
- `lib/providers/sync.ts` follows `has_more`/`last_id` up to ten pages and
  refuses a partial import when a page claims more but supplies no cursor. It
  also refuses an unparseable body. The write (`replaceModels`) is reached only
  after the complete catalog is in memory, so a failure leaves every row and its
  sync timestamp untouched.
- Soft delisting is unchanged: a model absent from a complete source is marked
  out of catalog, never deleted, and manual price/group/disable choices survive.

Benchmark integrity was verified rather than rebuilt: the existing lease,
interval, quota, pagination and sanity gates live behind `lib/benchmark-sync.ts`,
and the HTTP receipt now exercises them against a local fixture source
(pagination, collapsed payload refusal, stale-row provenance for an unmeasured
dropped model, and a spent daily window that makes no request). A stale row keeps
its own `index_version` and `measured_at`; only its `stale` flag changes.

Verification: `npm run verify` exit 0 — 297 unit tests, 320 HTTP checks, trial
HTTP PASS, quality PASS (267 files), clean lint/typecheck/build. New coverage:
`tests/catalog-integrity.test.mjs` plus provider/benchmark HTTP cases.

Remaining limits, not claimed: no live provider catalog or live Artificial
Analysis window was observed (the fixture is local; a real key/quota run belongs
to 044/062). A provider that paginates with a cursor parameter other than
`after_id` would surface as a refused partial import rather than a truncation.
A changed public model id would still collide with the
`(upstream_slug, upstream_id)` uniqueness constraint during sync; the fixture
surfaced that path, and reconciling an id-scheme change is not implemented.

## Lessons Learned

A source returning HTTP 200 does not prove it returned a complete valid catalog.
