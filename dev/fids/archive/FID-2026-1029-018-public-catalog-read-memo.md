# FID: Public catalog read memo

**Filename:** `FID-2026-1029-018-public-catalog-read-memo.md`
**ID:** FID-2026-1029-018
**Severity:** low
**Status:** closed
**Created:** 2026-10-29 18:30
**Automation level:** 3
**YAGNI-Compliance:** Verified — 34 lines of generic memo plus one call site; no
cache server, no background revalidation, no dependency.

> **Sequencing disclosure.** Implementation and design landed in the same pass.
> The record reflects the code that exists.

---

## Summary

`listModels()` re-ran a three-way join and mapped 44 rows to summaries on every
public catalog read, including every `/api/models` and `/v1/models` request. It
is a display projection: no money is computed from it, and the billed values are
resolved per call by `getModelForGateway`. This FID adds a five-second,
per-process memo for that projection only, with no invalidation hooks, and
documents the staleness window.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** `16e431f` at start

## Detailed Description

### Problem

Every catalog read pays the same SQL and mapping cost. Repeated reads inside a
five-second window (agents listing models, the public catalog, admin-adjacent
views) duplicate identical work against a mostly static table.

### Expected Behavior

- Repeated public catalog reads within five seconds do not re-query.
- Admin reads (`listAllModels`) always hit the database.
- The billing lookup (`getModelForGateway`) is never cached.
- Staleness is bounded and documented.

### Root Cause

No reuse layer existed for read-only projections; the file-size ceiling also
made a second module preferable to inlining.

### Evidence

```text
Measured 2026-10-29 against data/gateway.db, 300 iterations, 20 warmups:
  catalog_query_avg_us = 150.2
  catalog_rows = 44
Command: better-sqlite3 readonly, same SELECT/JOIN/WHERE as listModels.
```

This measures the avoided query, not end-to-end HTTP latency.

## Impact Assessment

### Affected Components

- `lib/cache.ts` (new)
- `lib/store/models.ts` (`listModels` memo)
- `tests/cache.test.mjs` (new)

### Risk Level

- [x] Low: display-only data; a stale price is possible for at most five
  seconds after an admin edit, and the billed price is read fresh.

## Proposed Solution

### Approach

`createTtlCache<T>(ttlMs, now)` stores one value and an expiry. `get()` returns
`null` when empty or expired; `set()` records `now + ttl`; a zero TTL never
serves (expiry equals set time). `listModels` reads the memo, falls through to
the query on a miss, and stores the mapped array.

### Steps

1. Add the generic memo with an injectable clock. — implemented
2. Memoize `listModels` at five seconds. — implemented
3. Unit-test hit, expiry, clear, and zero-TTL behavior. — implemented

### Verification

`tests/cache.test.mjs` (3 cases) drives the clock directly; no sleeping.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/cache.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-29
- lint: exit 0, zero warnings
- typecheck: exit 0
- test: 133 tests, 133 pass, 0 fail (includes 3 cache cases)
- quality: exit 0, PASS over 207 files
- build: exit 0
- measurement: 150.2 µs average catalog query, 300 runs, 44 rows (read-only DB)

## Perfection Loop

### Loop 1 — RED

- **RED:** Repeated identical catalog queries with no reuse.
- **GREEN:** Five-second memo for the public projection.
- **AUDIT:** `listAllModels` and `getModelForGateway` are untouched; grep shows
  the cache used only inside `listModels`.
- **ADVERSARIAL:** A process restart clears the memo, which is correct; there is
  no cross-process cache to invalidate.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Why not invalidate on sync/pricing writes? → Eight mutation sites across
   three modules; missing one would create an unbounded stale window. A short
   TTL fails safe and needs no hooks.
2. Does this cache billing data? → No. Prices used for charges come from
   `getModelForGateway` per request. Only the display projection is cached.
3. Multi-process deployment? → Each process keeps its own five-second window;
   no correctness dependency.

### Implementation Evidence (REQUIRED for `closed`)

- [x] Commit SHA: `58d5556`
- [x] File:line ranges: `lib/cache.ts`, `lib/store/models.ts` (`listModels`
  memo read/write)
- [x] Gate output: Verification Receipt
- [x] Reproducibility: `grep -rn "publicCatalogCache" lib/store/models.ts`
- [x] Step statuses: all three `implemented`

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the Proposed Solution
- [x] Gates pass
- [x] Call graph: `/api/models` and `/v1/models` → `listModels` → memo
- [x] Status reflects the tree

### Loop 2 — Independent audit and self-correction

- **RED:** The first cache test constructed the memo with an object instead of a
  TTL number, and the zero-TTL case asserted one successful read.
- **GREEN:** Corrected both expectations; zero TTL now documents "disabled".
- **AUDIT:** `node --test tests/cache.test.mjs` passes.
- **ADVERSARIAL:** Five seconds is a product choice, not a law; it is stated in
  the admin-facing documentation and the FID.
- **CHANGE DELTA:** ~4%.

### Loop 3 — Final convergence

- **RED:** The added constant pushed `lib/store/models.ts` to 401 lines, failing
  the 400-line quality gate.
- **GREEN:** Inlined the literal TTL with a one-line comment; the file is 399
  lines and the number appears once.
- **AUDIT:** `npm run quality` → PASS over 207 files.
- **ADVERSARIAL:** No behavior change from the refactor.
- **CHANGE DELTA:** ~1%.

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Generic TTL memo plus a five-second memo for the public
  catalog projection; billing path untouched.
- **Tests Added:** Yes — `tests/cache.test.mjs`.
- **Verification Evidence:** Verification Receipt above.
- **Archived:** 2026-10-29 — `dev/fids/archive/`

## Lessons Learned

Memoize display projections, not money paths. Without invalidation hooks, a
short TTL is the safest bound; a cache with no invalidation and no expiry is an
outage waiting for an admin edit.
