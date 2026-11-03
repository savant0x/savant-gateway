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
`X-RateLimit-Scope: provider` instead of the customer's `paid` bucket. Raising
that fixture cap did not make the burst reach the customer bucket, so the probe
was reshaped instead of widening the provider gate.

## Impact Assessment

- **Affected components:** `scripts/http-suite/request-limit-checks.mjs`,
  `scripts/http-suite.mjs` fixture environment.
- **Risk:** high — a green local run can fail on slower CI hardware, blocking
  every release push even when the paid limit works.

## Proposed Solution

1. **implemented:** replace sequential probing with 40 concurrent batches of
   three requests across two keys belonging to the same customer — 120 probes,
   double the 60-token bucket, at three-way concurrency under the default
   four-slot provider gate.
2. **implemented:** leave `PROVIDER_SHARED_CONCURRENCY` at its normal fixture
   value so the provider admission path is unchanged; the quota checks that set
   `rpm: 1` still assert the provider scope independently.
3. **implemented:** keep the no-charge and no-upstream-spend assertions for
   every admitted probe, and assert the refusal names the `paid` scope.

## Verification Gates

- `npm run test:http`
- GitHub Actions `ci` workflow on the fix commit

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the sequential probe depends on request latency versus refill rate.
- **GREEN:** 120 probes in three-way batches exceed the bucket capacity faster
  than it refills, independent of runner speed, while staying inside the
  provider concurrency gate.
- **AUDIT:** confirmed the provider concurrency gate runs before the paid bucket
  and that the quota checks cover the provider scope independently.
- **ADVERSARIAL:** slow runner, burst scheduling, 402 versus 429, two keys on
  one account, no upstream dispatch, and the provider gate must remain intact.
- **CHANGE DELTA:** 4%; converged.

### Missed Questions

1. **Should the burst be unbounded?** No; 120 probes are bounded at twice the
   60-token capacity and run three at a time.
2. **Should the fixture raise provider concurrency instead?** No; that changes
   the admission path the gate is meant to observe. Batching keeps the default
   provider gate in force and still spends the customer bucket.

## Implementation Evidence

- **Commit SHA:** this commit (the first commit after `b6604af`).
- **Local receipt:** `npm run test:http` → `paid account limit holds across
  different keys PASS`, `account refusal names paid rate scope PASS`, 750 checks
  PASS, trial suite PASS.
- **CI receipt:** pending the push that carries this commit.
- **Archived:** no; closes after the CI run is green.

## Resolution

- **Convergence Date:** 2026-11-03
- **Fix Description:** the HTTP gate now proves the shared paid bucket with
  bounded three-way batches and observes the customer scope without changing
  the provider concurrency gate.
- **Archived:** no.
