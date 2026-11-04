# FID: Free-allocation refusal truth and hermetic supply

**Filename:** `FID-2026-1104-003-free-allocation-refusal-truth.md`
**ID:** FID-2026-1104-003
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 16:30
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

A non-trial free refusal reports `Daily trial-credit allocation reached (900
weighted tokens)` while the lifetime trial is disabled. The 900 is the account's
allocated share of a 1,000-token local pool, not the upstream plan, which grants
20,000,000 weighted tokens per UTC day and has used none of them. Two defects
compose: one message builder names the wrong limit, and the load harness never
asserted the effective free-pool policy it measured. The result was three load
failures misread as product behavior and a release receipt that names a feature
that is switched off.

This record is design-only. Coding is reserved to the operator's separate
worker per the 2026-11-04 SCOPE ruling.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; disposable PostgreSQL.
- Repository HEAD `aef6730`; two untracked conversation exports, no source edits.
- Upstream metadata read: `2026-11-04T16:24:23.654Z`, host `api.apinex.bond`,
  read-only `GET /balance` and `GET /subscription`, no inference, no spend.
- Dated load receipt: `dev/audits/2026-11-04-load-isolated.json`.

## Detailed Description

### Problem

`dev/audits/2026-11-04-load-isolated.json:341` records six mixed-billing 429s
and the post-reset free 429 with the body:

```text
{"error":{"message":"Daily trial-credit allocation reached (900 weighted
tokens). Resets at 2026-11-05T00:00:00.000Z."}}
```

`TRIAL_ENABLED=false` was pinned by `scripts/load/envelope.mjs:159`, and the
branch that produced the body is the shared free-pool path, not the trial
ledger. The number and the name are both wrong for what happened.

### Expected Behavior

1. A refusal names the limit the caller actually hit: the account's daily share,
   the per-account cap when it binds, the provider reserve floor, unavailable
   provider capacity, or the lifetime trial when that mode is the one enabled.
2. A non-trial refusal never mentions a trial.
3. A measurement gate pins the policy it depends on, reads back the effective
   policy the server resolved, and fails when the two disagree.

### Root Cause

**One message for every allowance refusal.** `lib/free-pool.ts:171` formats
`Daily trial-credit allocation reached (...)` inside `decideFreeAdmission`, which
serves both the trial and the shared-pool path. `lib/allocation.ts:174` holds the
mode-correct formatter `Daily free-tier allocation reached (...)` for the
allocation ledger, and the two texts never reconcile. This is also the duplicated
lookup/formatting helper the quality bar forbids.

**900 is a local share.** `lib/storage/store/free-pool.ts` computes
`shareTokens` from `ensureDailyAllocation`, reduces it with
`accountDailyAllowance`, and passes the result as
`decideFreeAdmission({ ...config, dailyWeightedTokens: dailyAllowance })`. The
formatter then prints that number. With `allocation_bps = 9000` and one active
account, 900 means a configured daily pool of 1,000 tokens:

```text
floor(1,000 × 9,000 / 10,000) = 900
floor(900 / 1 active account) = 900
min(900, account_cap 100,000)  = 900
```

**The harness never checked.** `scripts/load/envelope.mjs:153` pins
`FREE_POOL_ALLOCATION_ENABLED`, `FREE_ACCOUNT_DAILY_CAP`, `FREE_SHARED_RPM` and
`PAID_KEY_RPM`, and passes the fixture's RPM and concurrency, but it pins neither
`FREE_POOL_DAILY_WEIGHTED_TOKENS` nor `FREE_POOL_ALLOCATION_BPS`. `next start`
also loads `.env.local`, and `getAllocationConfig(db)` lets a stored settings row
override the environment, so a development-scale value reached the server
unread. `scripts/http-suite.mjs:88` pins 20M / 9000 / 100k for exactly this
reason; the load runner inherited the drift instead.

**No reason was recorded.** `scripts/load/verdict.mjs:188` reports four statuses
for the quota-reset probe and no refusal reason; the mixed-billing row counts
statuses only. A 429 that says "trial" was therefore the only evidence available.

### Evidence

Upstream supply, read-only, values only:

```text
2026-11-04T16:24:23.654Z  api.apinex.bond
GET /balance       200  balance_usd=0  rpm=15  rpm_plan=free
GET /subscription  200  mode=free  token_limit=20,000,000  tokens_used=0
                         tokens_remaining=20,000,000  allowed=true  plan=null
```

The account is on the free plan with the full daily grant unused. The recorded
probe in `knowledge.md:123-128` matches: the upstream free plan grants
20,000,000 weighted tokens per UTC day for the whole account, and 15 RPM is a
separate request ceiling. `0/20M used` also confirms the load fixture never
reached upstream, which was its intent.

Code reachability, inspected:

```text
lib/free-pool.ts:171                     trial wording on the shared path
lib/allocation.ts:174                    correct free-tier wording, unused here
lib/storage/store/free-pool.ts           dailyAllowance -> dailyWeightedTokens
lib/storage/store/allocations.ts         settings override the environment
scripts/load/envelope.mjs:153-161        incomplete pin set
scripts/http-suite.mjs:87-90             complete pin set
```

## Impact Assessment

### Affected Components

- `lib/free-pool.ts` — refusal text and reason selection.
- `lib/allocation.ts` — duplicate message formatter.
- `lib/storage/store/free-pool.ts` — call site that supplies the effective share.
- `scripts/load/envelope.mjs` — fixture policy pinning.
- `scripts/load/verdict.mjs`, `scripts/load/faults.mjs` — refusal evidence.
- `config/load-envelope.json` — observed supply and gate meaning.

### Risk Level

- [x] High: release evidence integrity. Three of eight load failures were
  classified as product behavior when they were fixture drift, and the refusal
  violates the honest-copy non-negotiable.
- No money movement, no balance, no price and no admission rule changes here.

## Proposed Solution

### Approach

Make the refusal describe the decision that produced it, and make the
measurement prove the policy it ran under. No new module, no new dependency, no
change to admission outcomes.

### Steps

1. **One limit-aware refusal builder.** Extend the existing formatter so
   `decideFreeAdmission` emits the live mode and the actual limit: the account's
   allocated share, the per-account cap when `capBinds` is true (the store
   already computes this), the provider reserve floor, unavailable capacity, or
   the lifetime trial when `TRIAL_ENABLED=true`. Delete the divergent text in
   `lib/allocation.ts` or make it call the same helper. The reason enum already
   distinguishes these cases; only the rendering is wrong.
2. **Pin both environment families.** In `scripts/load/envelope.mjs`, pin
   `FREE_POOL_DAILY_WEIGHTED_TOKENS`, `FREE_POOL_ALLOCATION_BPS`,
   `FREE_POOL_ALLOCATION_ENABLED`, `FREE_ACCOUNT_DAILY_CAP` and the legacy
   `FREE_DAILY_WEIGHTED_TOKENS` fallback.
3. **Read back the effective policy.** After the server is ready and before any
   workload runs, read the app's own settings surface and assert the resolved
   `daily_pool`, `allocation_bps`, `account_daily_cap` and `allocation_enabled`
   equal the envelope. Fail the run with both value sets, not a generic timeout.
   A stored settings row can override the environment, so read-back is the proof,
   not the pin.
4. **Record the refusal reason.** Add `refusalReason`, `effectiveAllowance` and
   `effectivePoolTokens` to every unexpected status in the load JSON, and report
   the reason in the verdict line instead of the status alone.
5. **Declare the supply.** Add `observedDailyWeightedTokens: 20000000`,
   `observedRpm: 15`, `observedAt: "2026-11-04T16:24:23Z"` and a source string to
   `config/load-envelope.json` under `environment`, and assert the fixture's
   effective pool equals the observed grant.

### Verification

- RED: a unit case builds a non-trial share refusal and asserts the message
  names the share and never the trial; it must fail against the current
  `lib/free-pool.ts`.
- RED: booting the load fixture with a 1,000-token `FREE_POOL_DAILY_WEIGHTED_TOKENS`
  must fail the policy assertion with both value sets.
- GREEN: the same run with the pinned envelope passes the assertion and reports
  refusal reasons for any remaining 429.
- Acceptance: the isolated mixed-billing workload records 24 completed responses
  with no unexpected 429; if a 429 remains, its recorded reason identifies the
  binding limit. No expected 429 changes its admission outcome.

### YAGNI

No new store, schema, migration, flag, dependency or target change. The
sustained-versus-burst reading of the 20 rps target stays an audit note; this
FID does not redefine the envelope's targets.

## Verification Gates

- gate: test tests/free-pool.test.mjs — extend with the refusal-mode cases.
- gate: test tests/allocation.test.mjs — extend with configuration precedence.
- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: quality — `npm run quality`; required because `lib/` is touched.
- gate: build — `npm run build`.
- gate: test:load — `npm run test:load`, isolated, with the pinned envelope.
- gate: verify — `npm run verify:supabase` when the full set is claimed.

### Verification Receipt

- verified: not yet — design converged, implementation pending.
- No gate output is claimed for code that does not exist.

## Perfection Loop

### Loop 1 — RED

- **RED:** the refusal body names a disabled feature and the number is a local
  share; the harness pins four policy variables and reads back none; the verdict
  records statuses without reasons.
- **GREEN:** one formatter keyed on the existing reason enum; both environment
  families pinned; effective policy read back and compared; refusal details
  recorded.
- **AUDIT:** `lib/free-pool.ts:171` is the only builder on this path;
  `lib/allocation.ts:174` is divergent and unused by it; `capBinds` in
  `lib/storage/store/free-pool.ts` already distinguishes share from cap;
  `scripts/http-suite.mjs:88` proves the pin set is sufficient elsewhere.
- **ADVERSARIAL:** allocation can be disabled, in which case `shareTokens` falls
  back to `FREE_DAILY_WEIGHTED_TOKENS`. Pinning only the pool variables would
  leave that path unmeasured, so both families are required. A stored settings
  row still wins over either, which is why read-back is mandatory.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does 900 prove the pool is broken?** No. 900 = floor(0.9 × 1,000 / 1), so
   the configured pool was 1,000. The admission arithmetic is correct; the
   configuration and the copy are not.
2. **Should the pool value be changed to 20M in production?** Not by this FID.
   The observed grant is recorded; any live policy change is an operator
   decision with its own receipt.
3. **Does the 15 RPM ceiling disappear because tokens are available?** No. The
   live read returns `rpm=15` and `rpm_plan=free`; the 20M grant is the token
   axis, not a request-rate grant.
4. **Can this be fixed without touching admission outcomes?** Yes. The reason
   enum and `capBinds` already carry every distinction; only rendering and
   measurement change.
5. **Is the load target redefined here?** No. 20 rps remains a burst/overhead
   target. At weight 3 and ~400 raw tokens, the daily grant supports about
   11.6 RPM sustained, which is a separate audit finding.

### Loop 2 — Independent audit and self-correction

- **RED:** step 3 could assert against environment values and still miss a
  database override, which is the actual failure mode.
- **GREEN:** the assertion reads the resolved settings surface after boot and
  compares to the envelope; the environment pin is a second line of defense.
- **AUDIT:** `getAllocationConfig` reads stored settings before the environment;
  the read-back route exists for the admin gateway surface. No new endpoint is
  required.
- **ADVERSARIAL:** reading settings adds a startup dependency on the database.
  The harness already waits for schema and readiness, so this is ordering, not a
  new failure class; a read-back failure fails closed with its own message.
- **CHANGE DELTA:** 6%.

### Loop 3 — Final convergence

- **RED:** residual risk that a new test asserts the old wording elsewhere.
- **GREEN:** the two affected unit files are named in the gates; both already
  exercise the formatter.
- **AUDIT:** no other production caller formats an allowance refusal; the search
  for the two message strings reaches only these builders and their tests.
- **ADVERSARIAL:** the copy change must not alter `Retry-After` or
  `X-RateLimit-Reset`, which are derived from the same decision object and stay
  untouched.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Pending. Coding is reserved to the operator's separate worker; this record ships
the design, acceptance criteria and gates only.

- [ ] **Commit SHA:** not yet.
- [ ] **File:line ranges:** not yet.
- [ ] **Gate output:** not yet.
- [ ] **Reproducibility:** RED cases defined above; no code to grep yet.
- [ ] **Step statuses:** all five proposed steps are design-only; none is
  `implemented`. No step is `deferred` by the operator.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist in the working tree.
- [x] The described call path matches the inspected source.
- [ ] Typecheck/tests/lint — pending implementation.
- [ ] Production call-graph evidence — pending implementation.
- [x] Status reflects reality: `converged`, not `fixed`.

## Resolution

- **Convergence Date:** 2026-11-04 16:30
- **Next action:** the worker implements steps 1–5, captures the two RED runs,
  and returns a gate receipt.
- **Archived:** no.

## Lessons Learned

A refusal message is evidence. If it names the wrong limit, every downstream
audit inherits the error. Pin what the server reads, then read back what it
resolved: an environment pin is a request, not a proof.
