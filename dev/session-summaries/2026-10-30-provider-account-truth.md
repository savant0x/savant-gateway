# Session record: provider account truth

**Session ID:** 2026-10-30-provider-account-truth
**Initial commit:** `b9764fe`
**Mode:** single-agent ECHO v0.1.2, strict, autonomy 3

## Intent before edits

FID-2026-1030-063 traces and repairs yesterday's quota displayed as live and
used for admission today. Every check obtains upstream account values; failure
reports unavailable rather than using cached success. Read-only live evidence
at 15:42 UTC matches the operator's provider dashboard: 0 used / 20M remaining.
The gateway's stored snapshot is October 29, 19,631,919 used / 368,081 remaining.

Preserve unknown/zero/unlimited/reset semantics, local reservations, account
isolation and secrets. Separate account observation from catalog replacement.
Run the document Perfection Loop before code, regression and production HTTP
gates after code, then commit and archive with evidence. No offering activation,
funding, deployment or change to the operator's research documents.

## Operator steering

The supplied APInex email distinguishes the master-account integration sandbox
from commercial PAYG. The operator then chose daily allocated trial credits
aligned with the real 20M provider-wide daily reset, not the separate lifetime
grant mode. Q4 records this authority. The email is recorded in
`docs/offering-evidence.md`; it does not establish exact rates or funding.

## Implementation and double audit

- One no-store account reader, separate from catalog sync. SQLite lease owner
  and expiry fence late writers; configuration edits invalidate observations.
- Strict numeric/quota parsing; unknown, explicit zero, unlimited and expired
  states remain distinct. Free observations require the actual UTC reset.
- Every account check and free dispatch reads upstream. Admission rechecks the
  observation and subtracts conservative local overlap/holds in its immediate
  transaction. Pending, failed and expired observations cannot authorize calls.
- Admin overview, provider management, gateway settings and customer daily
  credits use this path. Current figures clear during checks/failure/expiry.
  Customer checks use the authenticated identity and omit master-account values.
- Daily allocations use observed capacity, shared reserve and per-account cap;
  returning grants shrink with capacity and suspended accounts release unspent
  shares. Usage/holds remain recorded. Live holds across UTC reset count toward
  the new day's admission. Lifetime mode cannot also issue daily allocations.
- A manual source/FID audit traced all new production callers and reviewed the
  accounting transaction, parser trust boundary, client masking and lease races.

## Verification receipt

`npm run verify` exit 0, 2026-10-30: lint zero warnings; typecheck exit 0;
config-check PASS (non-production); 242/242 unit tests; quality PASS, 247 files;
production build without warnings; main HTTP 242 checks PASS; trial HTTP all
checks PASS. Attribution guard PASS and `git diff --check` exit 0.

The source/gate audit uses `tests/quota-refresh.test.mjs`,
`tests/free-pool.test.mjs`, `tests/allocation.test.mjs` and both required HTTP
suites. HTTP cases reproduce the reported mismatch, changing data within one
second, failures, missing/expired reset, null/unlimited quota, preserved holds,
configuration changes during refresh, catalog failure, customer isolation,
exact daily usage and distinct lifetime grants. Rendered HTML is exercised;
interactive browser clicks were not part of this receipt.

Early failures were corrected: a schema import needed `.ts` for Node tests;
the new customer fixture needed a real password hash for session resolution;
format warnings were removed. The first production build exposed four inherited
startup warnings; Node-only conditional import and an explicit path-tracing
hint remove them. Final verification includes those repairs.

## Live evidence and boundary

At 16:09:18 UTC the running local endpoint returned HTTP 200: balance $0.00,
0 used / 20,000,000 remaining, reset 2026-10-31T00:00:00.000Z, matching the
read-only upstream subscription response. A preceding upstream balance timeout
and HTTP 522 were observed; failed reads became unavailable rather than old
success. No model generation or payment was used for the live receipt.

One-time trials remain disabled; no active plan is offered. No eligible active
key-holding account exists in the local database at the final read. No source
change can guarantee upstream availability or replace commercial rate/funding,
provider-wide admission (048), durable recovery (051), or launch acceptance (062).

## Closure

Implementation committed as `d31d9e0d6980245e2732b9f03ec9e69983acbcd5`.
FID-063 closed and moved to `dev/fids/archive/` at 16:17 UTC with the real
implementation hash and gate receipt. Q1–Q5 are complete. The closure commit is
documentation only; the normal push runs the full mandatory pre-push gates.
The operator's two untracked research documents remain untouched.
