# Session summary: durable settlement (051)

**FID:** FID-2026-1030-051
**Date:** 2026-10-30
**Implementation:** `0ce4747`
**Branch:** `main`

## Measured defects

- No durable row named an admitted call, so a crash between dispatch and
  settlement left only a hold ID and no uniqueness rule.
- `releaseExpiredHolds` deleted an expired credit hold and reduced
  `held_micros` on a timer; subscription holds and free-pool reservations were
  returned the same way. Expiry is not evidence that no upstream work happened.
- No inspection or operator resolution existed for uncertain outcomes.

## Implemented

- `settlements` row written before dispatch with billing source, reservation
  links and estimate. `recordUsage` claims it (`admitted → committed`) inside the
  transaction that writes usage, the debit, the ledger row and the hold release;
  a duplicate or quarantined claim returns zero and writes nothing.
- `quarantined_holds` receives expired credit, subscription and free-pool
  reservations. Reserved money and allowance stay reserved; free-pool admission
  counts unresolved quarantine. Only `releaseQuarantinedHold` frees an amount,
  once, with a note.
- `GET /api/admin/settlements` inspects settlements and quarantine;
  `POST` releases one entry and 404s an unknown one.

## Receipt

`npm run verify` exit 0: lint zero warnings, typecheck, 264/264 tests (five new),
quality PASS (400-line ceiling, 256 files), clean production build, 254 HTTP
checks, trial HTTP suite PASS. HTTP adds inspection reachability and refusal of
an unknown quarantine. Local logs `data/051-verify.log` and `data/051-http.log`
are ignored receipts.

## Limits and next

Crash survival is proven at the durable-state level; no killed-process restart
receipt was produced. Quarantine behavior is unit-covered, not route-covered.
The operator resolution is an API route with no UI. Backup/restore and incident
drills remain 058/059, and real-provider wallet equivalence remains 062.

Next dependency-ordered engineering work is 052 (credit reconciliation, refunds
and financial corrections), which now has the settlement identity and quarantine
ledger to correct against. The two untracked research documents remain the
operator's.
