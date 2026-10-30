# Provider account truth: pre-implementation audit

FID-2026-1030-063, baseline `b9764fe`, 2026-10-30.

## Trace and adversarial evidence

- `components/dashboard/provider-card.tsx:18`: "Live state" renders persisted
  counters without observation time or a refresh caller.
- `lib/store/overview.ts:119`: `provider: getProviderStatus()`; public projection
  uses the same stored values at lines 83–94. No upstream call occurs.
- `lib/providers/sync.ts:99`: balance/subscription fetch happens only during
  catalog sync; line 182 stamps catalog completion, not quota request start.
- `lib/store/free-pool.ts:91`: usage is subtracted since `status.syncedAt`;
  yesterday's observation is valid indefinitely in the ordinary free branch.
- `lib/providers/request.ts:80`: `Number(value)` coerces null/blank/boolean to 0.
- `lib/free-pool.ts:120`: unknown remaining bypasses the provider floor.
- Live GET receipt at 15:42:13 UTC: 0 used / 20M remaining, whereas SQLite
  stores October 29 21:15:21 UTC, 19,631,919 used / 368,081 remaining.

Audit corrections: configuration edits and lease expiry must fence late writers;
explicit checks must never reuse success within a TTL; browser transport failure
must clear old figures; unsupported quota APIs cannot authorize unknown capacity.
Refresh does not replace the catalog or alter offering/entitlement decisions.

## Document convergence, before source edits

Initial normalized characters 7,881; corrected 8,486; Levenshtein distance 641,
8.1335% (below 10%). Stable design SHA256:
`259D29AC2E2FC0BDCF16499F8FB1F4176724430308BD4792CD912DD9D1CDEAC1`.
Pass 1: source/readout/admission callers and declared test paths audited, zero
further document changes, 0%. Pass 2: reset, config race, timeout, concurrent
usage and operator no-stale requirement challenged, same SHA256, 0%.
Design is converged; implementation/gate success is not yet claimed.

## Operator steering: daily allocated trial credits

Before allocation code edits, audited existing `ensureAllocation`, active-key
eligibility, weighted usage, live holds and UTC-day keys. Extend those paths
with an observed pool cap and returning-account rebalance; do not mint a second
lifetime grant or dollar credit. The email is provider-supplied context only.
Two stable passes retain SHA256
`A07AE62A4502E79DAADE4916E406E718BC5B50662FAB2C43E93168EA97B1273A`;
the additive design update remains below the 10% pass cap. Existing allocation
tests must change the old assumption that returning grants ignore a lowered cap.

## Implementation audit and runtime receipt

Manual implementation re-read against the FID covers the parser, lease owner/
deadline, configuration invalidation, new authenticated routes, client masking,
allocation and admission transaction. Source grep finds production callers for
every new path: admin/console/provider pages and runtime API → account reader;
gateway trial routing → refresh → transactional free admission; customer page
and scoped trial API → daily summary → observed allocation. Catalog sync reuses
the account reader and advances only its own clock after model replacement.

`npm run verify` exit 0: lint zero warnings, typecheck, config-check PASS,
242/242 unit tests, quality PASS over 247 files, warning-free production build,
242 main HTTP checks and trial HTTP all PASS. Promised test files exist and run
under `npm test`; HTTP regression is wired into the required post-build suite.
Adversarial HTTP cases fence a delayed response after a provider configuration
edit; a failed catalog read preserves the separate fresh quota observation.
An enabled lifetime trial issues no parallel daily allocation.

Live local account response 16:09:18 UTC: HTTP 200, balance $0, used 0,
remaining 20M, reset 2026-10-31T00:00:00.000Z. Direct subscription GET agrees.
Prior upstream `/balance` timeout and HTTP 522 prove the need for unavailable
states; they are not hidden by the later success. This is account-read evidence,
not a live inference, paid transaction or witnessed overnight reset.
