# FID: Fresh provider quota and safe free/trial lifecycle

**Filename:** `FID-2026-1030-049-quota-and-free-access.md`
**ID:** FID-2026-1030-049
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-045, FID-2026-1030-048
**YAGNI-Compliance:** Verified — extend existing allocation and trial ledgers.

## Summary

Related implementation FID-2026-1030-063 repairs the demonstrated previous-day
quota, independent account refresh, strict parsing, UTC reset admission and
daily trial-credit allocation/readouts. Its receipt does not close this broader
launch contract: lifetime-trial prerequisites, cross-mode admission dependencies
and real launch/reset acceptance retain their original obligations.

Keep provider quota fresh and enforce reset, unknown/unlimited and allocation
semantics without inventing capacity. Prove both daily-free operation and the
disabled lifetime-trial safety branch; activation requires a separate offering decision.

## Environment

`lib/providers/sync.ts`, `lib/providers/request.ts`, `lib/store/free-pool.ts`,
allocation ledger and trial ledger. Existing trial defaults issue no grants.

## Detailed Description

### Problem / expected behavior / root cause

Quota observations are updated during sync; automatic freshness/reset acceptance
is missing. `fetchProviderBalance` defaults an absent balance to zero and numeric
parsing needs strict null/blank checks. A trial ledger exists but ownership delivery,
explicit pair/funding acceptance and cross-mode quota policy are unresolved.

### Evidence

`syncProvider` fetches runtime balance/subscription alongside catalog; the launch
inventory requires automatic quota refresh. `lib/trial-ledger.ts` requires email
verification. `tests/allocation.test.mjs` already covers the join rebalance/cap;
these are real implementations to preserve, not dummy counters to replace.

## Impact Assessment

Provider observations, scheduled/runtime refresh, admission and account summaries.
Risk high: stale or fabricated remaining capacity enables overspend or outages.
No automatic trial enablement or new free-to-paid model inference is authorized.

## Proposed Solution

### Approach and steps

1. Add a bounded, leased refresh path that updates provider quota independently
   from catalog replacement, with timestamps, failure state and UTC-reset handling.
2. Represent unknown/zero/unlimited/expired explicitly; account for usage and live
   holds since the matching observation without double subtraction at reset.
3. Verify daily share, reserve and account cap under joins/suspension/concurrent
   calls; one identity cannot receive both daily and lifetime grants accidentally.
4. Validate approved exact model pairs, issuance budget, email ownership and funded
   fallback. Keep trial-off until all activation evidence and operator permission exist.

### Verification

Extend existing `tests/free-pool.test.mjs`, `tests/allocation.test.mjs`,
`tests/trials.test.mjs`; planned `tests/quota-refresh.test.mjs`. HTTP checks cover
stale/unknown/unlimited/reset, refresh failure/races and disabled trial invariants.
Intended callers: runtime refresh service → provider state → free/trial admission;
admin/account readouts describe that same state. Production scheduler proof is 057/059.

## Verification Gates

- gate: test tests/free-pool.test.mjs
- gate: test tests/allocation.test.mjs
- gate: test tests/trials.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the existing named files and planned `tests/quota-refresh.test.mjs`; both HTTP
suites run. Real quota/reset observations require provider access and belong in 062.

## Perfection Loop

RED: stale/unknown quota and conditional trial prerequisites. GREEN: independent
quota refresh with exact observed-state semantics. AUDIT: pending. ADVERSARIAL:
reset or a partial upstream response must not mint a fresh personal trial.
Five questions: every quota state, bounded refresh storms, hostile signup churn,
one ledger truth and reproducible reset accounting.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: version each quota observation/reset
boundary and atomically reconcile the usage/holds it covers. Race tests must
cross UTC reset and delayed refresh without reusing old remaining capacity.
Final convergence checks are in the master planning-audit receipt.

Design only. 044 decides launch mode; the no-trial branch still needs tested
disabled behavior and truthful UI, rather than treating the feature as completed.

## Lessons Learned

A provider quota snapshot and a customer entitlement are different clocks and ledgers.

## Implementation Receipt — disabled-trial branch proof

Delivered as a test-only change (no production code, no harness change):

- **Hermeticity confirmed by read, not changed.** Every `startNextServer`
  caller pins trial mode explicitly and the harness applies caller env last, so
  an operator shell cannot flip the daily-free proof: `scripts/http-suite.mjs`
  pins `TRIAL_ENABLED: "false"`, `scripts/db-recovery-drill.mjs` pins
  `TRIAL_ENABLED: "false"`, and `scripts/trial-http-suite.mjs` pins
  `TRIAL_ENABLED: "true"`.
- **Unit gate:** `tests/trials.test.mjs` adds "disabled trial config can never
  issue a grant or reservation": `reserveTrial` with `config.enabled=false`
  returns false and writes zero `trial_grants` / `trial_reservations` rows
  (`trial-ledger.ts` first guard).
- **HTTP invariants** (`scripts/http-suite/quota-checks.mjs`, daily-free proof):
  daily mode writes no `trial_grants` row (the reverse of the enabled suite's
  "no daily allocation in lifetime mode" check); `/v1/models` publishes
  `trial_paid_transition: null` for every model while disabled; the account page
  renders "Daily trial credits" and never "Your one-time trial" (TrialCard null
  guard); `/api/account/trial` omits the lifetime-only `grantedTokens` field.
- **Deliberate non-additions:** no pure unit test for `trialOffer` disabled —
  it reads process env and the live DB with no injection point, and the
  end-to-end `/v1/models` invariant is the stronger proof. Account-page copy
  ("Access follows your trial allowance...") is truthful under daily mode and
  unchanged.
- **Receipt:** `npm run verify` full chain PASS — lint, typecheck, config-check,
  364 unit tests, quality, production build, main HTTP suite (678 checks
  including the six disabled-branch checks above), enabled trial suite, recovery
  drill.

Status remains `converged`: real launch/reset acceptance and the C3 provider-quota
refresh scope stay operator-gated (062 / offering decision).
