# FID: Trial reservation and settlement lock order

**Filename:** `FID-2026-1104-014-trial-reservation-lock-order.md`
**ID:** FID-2026-1104-014
**Severity:** high
**Status:** closed
**Created:** 2026-11-04 22:05
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Three concurrent first calls for one verified trial account can deadlock in
PostgreSQL. Trial reservation locks the user row `FOR UPDATE` and then needs the
trial-grant row. Settlement holds the trial-grant row and then inserts a row
whose foreign key takes a `KEY SHARE` on the same user. The two transactions
wait on each other, one request returns 500, and the trial gate intermittently
sees zero or two accepted calls. Reservation now uses `FOR NO KEY UPDATE`, which
still serializes competing reservations but remains compatible with settlement's
foreign-key key-share. The trial HTTP suite also prints the server log tail when
a check fails so a future storage failure is not reported only as `500`.

## Environment

- Windows; Node `v24.21.0`; Next.js 16.4.3.
- PostgreSQL 17.6 on loopback (`gateway_http`, disposable).
- Repository HEAD `616dc5a` before the repair.
- Discovered while running the FID-2026-1104-008 full verification gate.

## Detailed Description

### Problem

The trial concurrency check sends three first requests with the same customer and
`max_tokens: 120`. The expected result is one accepted call and two refusals that
issue no second grant. On the second of five reproduction runs, the check failed
with `expected 1, got 0`; the server log showed PostgreSQL error `40P01`:

```text
deadlock detected
Process 51720 waits for ShareLock on transaction 3083; blocked by process 8276.
Process 8276 waits for ShareLock on transaction 3080; blocked by process 51720.
while locking tuple (0,11) in relation "users"
SQL statement "SELECT 1 FROM ONLY "public"."users" x
  WHERE "id" OPERATOR(pg_catalog.=) $1 FOR KEY SHARE OF x"
```

The failing SQL is the foreign-key check for a row that references `users`. It
is not the explicit reservation lock, so the cycle spans a reservation
transaction and a settlement transaction.

### Expected Behavior

Concurrent first calls serialize on the account, issue exactly one trial grant,
admit one reservation, and return a refusal rather than an internal error for the
losing calls. A failed check prints the server-side cause.

### Root Cause

`reserveTrial` takes `SELECT ... FOR UPDATE` on the user row, then inserts the
grant and reservation. `settleFreeReservation` runs inside the usage-settlement
transaction: it updates the trial grant and then inserts usage/settlement rows
whose foreign keys take a `KEY SHARE` on the user row. `FOR UPDATE` conflicts
with `KEY SHARE`; holding the grant while waiting for the user lock creates the
reverse edge, so PostgreSQL aborts one transaction as a deadlock.

### Evidence

```text
trial-http-suite FAIL: concurrent calls admit only one trial — expected 1, got 0
⨯ error: deadlock detected
code: '40P01'
detail: Process 51720 waits for ShareLock on transaction 3083; blocked by process 8276.
        Process 8276 waits for ShareLock on transaction 3080; blocked by process 51720.
where: while locking tuple (0,11) in relation "users"
       ... FOR KEY SHARE OF x
```

## Impact Assessment

### Affected Components

- `lib/storage/ledger/trials.ts` — reservation lock order.
- `scripts/trial-http-suite.mjs` — failure diagnostics.
- Trial admission and free-call settlement under concurrency.

### Risk Level

- [x] High: a legal concurrent first request can return 500 instead of a
  documented refusal; the release gate is intermittently red. No double grant or
  double debit was observed.

## Proposed Solution

1. Change the trial reservation's user lock from `FOR UPDATE` to
   `FOR NO KEY UPDATE`. It still conflicts with another reservation lock, but it
   is compatible with settlement's foreign-key `KEY SHARE`.
2. Keep the grant and reservation inserts conditional. The lock is the
   serialization point; the conditions remain the correctness backstop.
3. Capture the Next.js server log tail in the trial suite's failure path so a
   future storage error names its cause.
4. Reproduce the failure before the change, then run repeated trial suites and
   the full real-PostgreSQL gate after it.

### Verification

RED: the trial concurrency check produces a 500/deadlock. GREEN: ten consecutive
trial suites pass on real PostgreSQL, the one-grant assertion still holds, and
the full `npm run verify` receipt passes every gate. No test assertion is
relaxed: the expected refusal count and single-grant count are unchanged.

### YAGNI

One lock mode, one diagnostic line, no retry layer, no schema change and no
weakened assertion. PostgreSQL already provides the needed row-lock mode.

## Verification Gates

- gate: `npm run test:postgres`
- gate: `npm run test:http`
- gate: `npm test`
- gate: `npm run check`
- gate: `npm run quality`
- gate: `npm run build`
- gate: `npm run verify`

### Verification Receipt

- RED reproduced: trial suite run 2 of 5 failed at the concurrent trial check;
  server log showed `deadlock detected` / `40P01`; one run passed and one failed
  before the repair.
- GREEN: after rebuilding, ten consecutive `node scripts/trial-http-suite.mjs`
  runs passed against disposable PostgreSQL 17.6 on loopback, including
  `concurrent calls admit only one trial`, `competing calls are refused without
  another trial`, `competing calls do not spend credit` and `customer receives
  exactly one grant`.
- Full gate: `npm run verify` PASS — 11/11 gates, `test` 1,019/1,019 with zero
  skips, `test:postgres` 4/4, `test:http` main suite 776 checks plus the trial
  suite, `test:recovery` 14/14, and `check`, `quality`, `build`,
  `storage:check`, `config:check`, `repository:check` and `deployment:receipt`
  all exit 0. Duration 126.6s; receipt `.verify/summary.json`.
- Clean install: `npm ci` exit 0 on Node 24 (488 packages) as part of the same
  FID-008 gate run.
- Managed host: `npm run verify:supabase` was not run; the configured Supabase
  endpoint uses a self-signed chain and no trusted CA is configured. The receipt
  is a disposable loopback PostgreSQL cluster, not a claim about the managed
  host.

## Perfection Loop

### Loop 1 — RED

- **RED:** concurrent trial calls return a deadlock 500 and zero accepted calls.
- **GREEN:** change the account lock to `FOR NO KEY UPDATE`.
- **AUDIT:** PostgreSQL's lock matrix keeps two `FOR NO KEY UPDATE` locks
  mutually exclusive and permits `KEY SHARE` alongside.
- **ADVERSARIAL:** a weaker lock must not allow two grants or two reservations.
  The conditional inserts and the single-grant assertion remain in place.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Is this a trial-only bug?** The cycle involves the trial grant and free-call
   settlement, but the lock-order rule applies to any transaction that holds the
   grant and then inserts a user-referencing row. The focused fix is here.
2. **Should settlement retry a deadlock?** No. Removing the conflicting lock
   mode fixes the cycle; a retry layer would hide a real ordering defect.
3. **Does the test need to accept 500?** No. The assertion is the contract; the
   server log was added so future failures are diagnosable.

### Loop 2 — Independent audit and self-correction

- **RED:** the original failure was reported as `500:unknown`, with no server
  cause.
- **GREEN:** the trial suite now includes `logTail(server.logs)` on failure.
- **AUDIT:** the tail is bounded by the existing harness and contains no
  credential values from the fixture.
- **ADVERSARIAL:** ten passes do not prove the absence of every interleaving.
  The one-grant check and the full gate remain the regression boundary; the
  PostgreSQL deadlock class is removed rather than timing-dependent.
- **CHANGE DELTA:** one diagnostic line.

### Loop 3 — Final convergence

- **RED:** a lock-mode change can silently weaken serialization.
- **GREEN:** two concurrent reservation transactions still conflict; the
  conditional grant and reservation inserts remain.
- **AUDIT:** ten repeated trial runs and the full verify gate pass with the
  original assertions.
- **ADVERSARIAL:** the managed host was not exercised; the receipt names that
  boundary rather than claiming it.
- **CHANGE DELTA:** 0%; converged.

## Implementation Evidence

- `lib/storage/ledger/trials.ts` — `reserveTrial` takes
  `SELECT id FROM users WHERE id = ? FOR NO KEY UPDATE`, with the lock-order
  rationale beside it.
- `scripts/trial-http-suite.mjs` — imports `logTail` and prints the server log
  tail when the suite fails.
- The implementation commit is `8f40a76`; this closure record names it.

## Code Verification Evidence

- [x] Files touched were read 0-EOF before editing.
- [x] The reservation still serializes on the user row and keeps conditional
  grant and reservation inserts.
- [x] The trial assertion was not relaxed.
- [x] The server log is available on failure without exposing a secret.
- [x] Status reflects reality: `closed` with a complete local PostgreSQL receipt;
  managed-host acceptance remains separate.

## Resolution

- **Closed Date:** 2026-11-04
- **Commit:** `8f40a76`
- **Fix Description:** trial reservation locks the account row with
  `FOR NO KEY UPDATE`, preserving serialization while allowing settlement's
  foreign-key `KEY SHARE` to complete. The trial HTTP suite now prints its
  server log tail on failure.
- **Tests Added:** No new test file; the existing trial HTTP suite was run ten
  times on disposable PostgreSQL 17.6 and passed every concurrent-trial check.
- **Verification Evidence:** full `npm run verify` PASS (11/11 gates,
  1,019/1,019 tests, zero skips, 4/4 two-connection proofs, 776 main HTTP checks
  plus the trial suite, recovery 14/14); repository, quality, attribution and
  whitespace checks PASS.
- **Archived:** 2026-11-04; moved to `dev/fids/archive/`.

## Lessons Learned

A row lock chosen for serialization can also participate in a foreign-key lock
cycle. When another transaction holds the dependent row first, `FOR NO KEY
UPDATE` may be the correct strength: exclusive against peers, compatible with
the key-share a child insert needs.
