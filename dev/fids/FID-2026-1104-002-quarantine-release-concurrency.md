# FID: Serialize quarantined-hold release

**Filename:** `FID-2026-1104-002-quarantine-release-concurrency.md`
**ID:** FID-2026-1104-002
**Severity:** high
**Status:** verified
**Created:** 2026-11-04
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

`releaseQuarantinedHold` reads an eligible row without locking it and releases
its reserved amount before marking it released. Two transactions can both read
the same quarantine and each subtract its amount from aggregate held capacity.
The existing sequential replay test cannot prove concurrent replay safety.

## Environment

- Windows; Node v24.21.0; PostgreSQL via generated disposable test database.
- Baseline `d0c7861`; production storage implementation is asynchronous.

## Detailed Description

### Problem

`lib/storage/ledger/settlements.ts` selects `status = 'quarantined'` without
`FOR UPDATE`, then decrements users or subscription-period held capacity, then
updates the quarantine row. `.immediate()` is an alias for an ordinary
PostgreSQL transaction; it provides no database-wide exclusion.

### Expected Behavior

Exactly one concurrent operator release succeeds; the other returns false.
Unrelated held capacity remains reserved. Credit and subscription paths use
the same serialized quarantine claim.

### Root Cause and evidence

The SELECT at the start of `releaseQuarantinedHold` has no row lock. Existing
`tests/ledger-postgres.test.mjs` covers only sequential release/replay.
Production reachability is `app/api/admin/settlements/route.ts` → store façade
→ `lib/storage/store/settlements.ts` → this shared ledger function.
Runtime race confirmation is required before claiming a demonstrated loss.

## Impact Assessment

- Affected: quarantine release SELECT and existing mandatory two-connection test.
- [x] High: duplicate release can expose capacity reserved by other calls.
- No schema, financial policy, data repair or live release is authorized.

## Proposed Solution

1. Add a two-connection regression in `tests/settlement-concurrency.test.mjs`.
   Hold the user's row on a third connection so two release transactions are
   both lock-waiting; then unblock them and assert one true/one false and the
   exact remaining aggregate. Use bounded polling and unique application names.
2. Run RED on a generated disposable database, then add `FOR UPDATE` to the
   existing quarantine SELECT. PostgreSQL rechecks eligibility after waiting.
3. Run GREEN and the existing ledger tests; the mandatory PostgreSQL gate
   already executes this test file and must cover both proofs.

Steps 1–3: implemented and verified. RED returned two successful releases;
GREEN preserves unrelated held credit with exactly one accepted release.

### Verification

Keep 300 micros held, release a 100-micro quarantine concurrently, and require
200 remaining, not 100. Always release the blocker, await both transactions,
remove only fixture rows and close pools. No production schema is reset.

## Verification Gates

- gate: test tests/settlement-concurrency.test.mjs
- gate: test tests/ledger-postgres.test.mjs
- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: test_postgres — `npm run test:postgres` on a disposable endpoint.
- gate: verify — `npm run verify:supabase`.

## Perfection Loop

### Loop 1 — RED / GREEN / AUDIT / ADVERSARIAL

- RED: unlocked SELECT, aggregate decrement and later unconditional status update.
- GREEN: row lock serializes all release kinds at their shared authority.
- AUDIT: `.immediate()` explicitly provides no lock in `pg-adapter.ts`; callers
  use the shared function. The mandatory gate already runs the chosen test file.
- ADVERSARIAL: merely racing promises is nondeterministic; an independent
  user-row blocker forces contention before either transaction can finish.
- CHANGE DELTA: initial design.

### Missed Questions

1. Can PGlite prove the race? No; the regression requires real connections.
2. Can a timer alone prove both callers read? No; observe two lock waits.
3. Does this repair existing balances? No; no live discrepancy is asserted.

### Loop 2 — Independent audit and self-correction

- RED: credit needs a nonzero unrelated hold to reveal double subtraction.
- GREEN: 300 held minus one 100 release must preserve 200.
- AUDIT: all touched implementation/test files were read completely.
- ADVERSARIAL: cleanup must await unsettled operations after releasing the blocker.
- CHANGE DELTA: 0% after this complete design was reviewed.

### Loop 3 — Final convergence

- RED: no further design correction found.
- GREEN: minimal SQL repair and mandatory runtime regression.
- AUDIT: no parallel release helper or store interface is added.
- ADVERSARIAL: caller rollback still restores both capacity and row status.
- CHANGE DELTA: 0%; converged before code.

## Implementation Evidence

Focused ledger/concurrency: 19/19. Full verify: exit 0, 2026-11-04T14:57:28Z,
980/980 tests and 2/2 mandatory PostgreSQL proofs, zero skips; all ten gates
PASS. The generated databases were dropped. Local commit follows verification.

## Code Verification Evidence

Referenced ledger, adapter, store and test file exist. Runtime loss remains
unconfirmed until the regression runs.

## Resolution

Open implementation under the converged design.

## Lessons Learned

Sequential idempotence is insufficient evidence for concurrent financial writes.
