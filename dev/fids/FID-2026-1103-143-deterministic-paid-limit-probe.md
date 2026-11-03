# FID: Deterministic paid account-limit probe

**Filename:** `FID-2026-1103-143-deterministic-paid-limit-probe.md`
**ID:** FID-2026-1103-143
**Severity:** high
**Status:** fixed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — test-hermetic change only, no production behavior.

## Summary

GitHub Actions run `41697724755` failed the HTTP gate at `paid account limit
holds across different keys`. The check probed sequentially at 60 RPM. On a slow
runner each request took about 0.75 s, while the bucket refills one token per
second, so 120 probes never exhausted it. A first attempt to burst 80 requests
then hit the separate provider concurrency cap (4) and observed
`X-RateLimit-Scope: provider` instead of the customer's `paid` bucket.

## Impact Assessment

- **Affected components:** `scripts/http-suite/request-limit-checks.mjs`,
  `scripts/http-suite.mjs` fixture environment.
- **Risk:** high — a green local run can fail on slower CI hardware, blocking
  every release push even when the paid limit works.

## Proposed Solution

1. **implemented:** replace sequential probing with one bounded burst of 80
   requests across two keys belonging to the same customer.
2. **implemented:** raise the fixture's `PROVIDER_SHARED_CONCURRENCY` to 100 so
   the burst reaches the customer bucket; the provider gate remains covered by
   the quota checks that set `rpm: 1` and assert the provider scope.
3. **implemented:** keep the no-charge and no-upstream-spend assertions for
   every admitted probe, and assert the refusal names the `paid` scope.

## Verification Gates

- `npm run test:http`
- GitHub Actions `ci` workflow on the fix commit

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the sequential probe depends on request latency versus refill rate.
- **GREEN:** a burst larger than the bucket capacity deterministically exhausts
  the customer bucket, independent of runner speed.
- **AUDIT:** confirmed the provider concurrency gate runs before the paid bucket
  and that the quota checks cover the provider scope independently.
- **ADVERSARIAL:** slow runner, burst scheduling, 402 versus 429, two keys on
  one account, no upstream dispatch, and the provider gate must remain intact.
- **CHANGE DELTA:** 4%; converged.

### Missed Questions

1. **Should the burst be unbounded?** No; 80 is bounded and just above the 60
   token capacity, with a fixture concurrency cap of 100.
2. **Does raising provider concurrency weaken production?** No; it is set only
   in the HTTP suite's spawned environment.

## Implementation Evidence

- **Commit SHA:** this commit (the first commit after `b6604af`).
- **Local receipt:** `npm run test:http` → `paid account limit holds across
  different keys PASS`, `account refusal names paid rate scope PASS`, 750 checks
  PASS, trial suite PASS.
- **CI receipt:** pending the push that carries this commit.
- **Archived:** no; closes after the CI run is green.

## Resolution

- **Convergence Date:** 2026-11-03
- **Fix Description:** the HTTP gate now proves the shared paid bucket with a
  latency-independent burst and observes the customer scope.
- **Archived:** no.
