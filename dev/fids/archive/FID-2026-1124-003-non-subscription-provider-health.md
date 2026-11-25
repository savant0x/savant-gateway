# FID: Non-subscription provider freshness and operations health

**Filename:** `FID-2026-1124-003-non-subscription-provider-health.md`
**ID:** FID-2026-1124-003
**Severity:** high
**Status:** closed
**Created:** 2026-11-24 23:40
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Two defects share one root cause: the provider runtime treats "this provider has
no subscription quota" as a **failure** rather than as an **absent capability**.

1. Every `/v1/chat/completions` call routed to a provider registered with
   `supports_subscription = 0` (InferHub, router-cheap, Apixo) performs a lease
   claim, a live outbound HTTP balance request and two `providers` writes on the
   request's critical path, because `quotaIsCurrent()` can never return true for
   such a row.
2. The same row is counted as `errored` (and `unknown`) by the operations
   snapshot, so `/admin/operations` raises a permanent **critical** incident
   (`quota:error`, "Provider quota is unavailable") for a provider that is
   working exactly as designed.

Adding InferHub made both defects load-bearing: the provider is enabled, it does
not expose a subscription quota, and it is now expected to serve general traffic.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `f2e1a53` on `main`, clean tree
- **Observed at:** 2026-11-24T23:25:43Z

## Detailed Description

### Problem

`lib/storage/providers/runtime.ts:100-105` derives the quota error from the
capability flag, not from a failed fetch:

```ts
const quotaError =
  quotaResult.status === "rejected"
    ? redactSecrets(quotaResult.reason).slice(0, 500)
    : provider.capabilities.subscription
      ? null
      : "Provider does not expose quota.";
```

`completeRuntimeCheck` persists that string into `providers.quota_error`
(`lib/storage/ledger/quota.ts:76-83`) and leaves `quota_observed_at` at whatever
`claimRuntimeLease` set it to — which is `NULL`
(`lib/storage/ledger/quota.ts:36-38`):

```sql
SET runtime_lease_id = ?, runtime_lease_until = ?,
    quota_observed_at = NULL, balance_observed_at = NULL
```

`getProviderStatusBySlug` maps the column straight through
(`lib/storage/store/provider-rows.ts:123`):

```ts
error: row.quota_error,
```

and `quotaIsCurrent` short-circuits on it (`lib/provider-quota.ts:186-192`):

```ts
if (quota.error || quota.checking || !observationIsRecent(quota.observedAt, now)) {
  return false;
}
```

So for a non-subscription provider the predicate is **structurally always
false**. `ensureProviderObservation` (`runtime.ts:170-190`) therefore always
falls through to `refreshProviderRuntime`, and `lib/storage/gateway/call.ts:189`
awaits it on every completion:

```ts
const status = await ensureProviderObservation(model.upstreamSlug);
const admission = await beginProviderAdmission({ db, provider, observedRpm: status.rpm });
```

The second defect is in `lib/storage/operations/snapshot.ts:126-131`, which
selects every enabled provider without regard to the capability:

```sql
SELECT slug, status, quota_unlimited, subscription_tokens_remaining,
       quota_observed_at, quota_error
  FROM providers WHERE enabled = 1 ORDER BY sort_order, label
```

and then counts the string written above as an error
(`snapshot.ts:159-161`):

```ts
if (provider.quota_error) {
  errored += 1;
}
```

`lib/operations-rules.ts:89-101` turns any non-zero `errored` into a critical
incident. `components/admin/operations-cards.tsx:105-111` renders the same
counts as "Provider quota current / enabled".

### Expected Behavior

1. An absent capability is not an error. A provider that does not report a
   subscription quota must not carry a quota error.
2. Freshness for such a provider is decided by the observation it *does*
   produce — its balance/RPM reading — not by a timestamp nothing writes.
3. Operations health evaluates quota only for providers that claim the
   capability, and states separately how many providers report no quota at all.
4. Admission keeps receiving an RPM ceiling. The check is *not* removed; it is
   made cheap by being made cacheable.

### Root Cause

Two different facts were collapsed into one nullable column. `quota_error` means
"the check failed" but is also written with a permanent sentinel meaning "this
provider never had a quota", and freshness keys on `quota_observed_at`, which
only a subscription check ever sets. Any consumer that asks "is the stored
observation usable?" gets "no" forever, and any consumer that asks "did
something go wrong?" gets "yes" forever.

### Evidence

Read-only inspection at `f2e1a53`:

```text
lib/storage/providers/runtime.ts:100   const quotaError =
lib/storage/providers/runtime.ts:103       : provider.capabilities.subscription
lib/storage/providers/runtime.ts:104         ? null
lib/storage/providers/runtime.ts:105         : "Provider does not expose quota.";
lib/storage/ledger/quota.ts:38               quota_observed_at = NULL, balance_observed_at = NULL
lib/storage/store/provider-rows.ts:123       error: row.quota_error,
lib/provider-quota.ts:186     if (quota.error || quota.checking || ...) return false;
lib/storage/gateway/call.ts:189  const status = await ensureProviderObservation(model.upstreamSlug);
lib/storage/operations/snapshot.ts:128-129   ... FROM providers WHERE enabled = 1 ORDER BY sort_order, label
lib/storage/operations/snapshot.ts:159       if (provider.quota_error) {
lib/operations-rules.ts:89-97                severity: "critical", "Provider quota is unavailable"
```

`schema/catalog.ts:25` shows the capability defaults to absent for a new row:

```sql
supports_subscription INTEGER NOT NULL DEFAULT 0,
```

## Impact Assessment

### Affected Components

- `lib/storage/providers/runtime.ts` — the freshness decision and the sentinel
- `lib/storage/ledger/quota.ts` — what a check writes
- `lib/provider-quota.ts` — the pure freshness predicate
- `lib/storage/store/provider-rows.ts` — status projection
- `lib/storage/operations/snapshot.ts` — quota counters
- `lib/operations-types.ts`, `components/admin/operations-cards.tsx` — honest display
- `lib/storage/gateway/call.ts` — caller behaviour (no signature change)

### Risk Level

- [x] High: one live upstream HTTP request on every completion for a
      non-subscription provider, plus a permanently red critical alert that
      trains operators to ignore the incident list.

## Proposed Solution

### Approach

Split "unsupported" from "failed", and make the freshness predicate depend on
the capability. The runtime check stays on the admission path because it is the
only source of `observedRpm`; it simply stops running on every call.

### Steps

1. **Separate the two meanings.** In `readRuntime`, write `quotaError = null`
   when `!provider.capabilities.subscription`. Do not synthesise a sentinel
   string; absence of the capability is carried by
   `providers.supports_subscription`, which every reader already selects. Keep
   the existing behaviour for a genuine rejection.
2. **Make freshness capability-aware.** Add a pure predicate to
   `lib/provider-quota.ts`:
   `providerObservationIsCurrent({supportsSubscription, balanceSupported, quota, balanceObservedAt, now})`
   with three cases: subscription-capable → the existing `quotaIsCurrent` rule;
   balance-only → `observationIsRecent(balanceObservedAt)` and no error;
   neither capability → `true` (nothing to observe, so nothing to refresh; a
   missing RPM is then a configuration fact reported by admission as
   `unknown_ceiling`, not a per-call network attempt).
3. **Use it in `ensureProviderObservation`.** Select the capability flags that
   the status already exposes and call the new predicate. No change to the
   lease, the in-flight promise sharing, or the "stale on failure" rule.
4. **Scope operations health by capability.** Select `supports_subscription` in
   the snapshot's provider query and evaluate `errored`, `stale`, `unknown`,
   `current` and `lowReserve` only for rows that report the capability. Count
   the rest in a new `quota.unsupported` field so the panel can say "3 providers
   report no quota" instead of silently dropping them.
5. **Display it honestly.** `operations-cards.tsx` renders
   `current / enabledProviders` plus "current · stale · unknown · error"; add
   the unsupported count and change the denominator to the number of
   quota-reporting providers, so the ratio stays meaningful.
6. **Keep the capital view correct.** `providerBalanceState` already treats a
   cleared observation as in-flight/unavailable, which stays valid: a value is
   not evidence while it is being replaced. Note in the FID record that
   `claimRuntimeLease` clearing `balance_observed_at` now also marks the capital
   row unavailable for the duration of a check.

### Non-goals

- No removal of the runtime check. It supplies `observedRpm`, and
  `resolveProviderRpm` (`lib/provider-admission.ts:137-145`) refuses with
  `unknown_ceiling` when both the observed and configured ceilings are absent.
  Deleting the check would break completions unless `PROVIDER_SHARED_RPM` is set.
- No change to lease semantics, quarantine, or the shared-admission bucket.
- No new background scheduler. Freshness, not scheduling, is the fix.

### Verification

A pure suite over the new predicate (all three capability cases, fresh/stale/
errored), plus a store suite on a disposable database asserting that a
non-subscription provider keeps `quota_error` null and is counted in
`quota.unsupported` rather than `quota.errored`, and that a second
`ensureProviderObservation` inside the freshness window performs no second
lease claim. Manual probe: one completion against a `supports_subscription = 0`
provider followed by `grep`-free inspection of `providers.runtime_lease_id`
(`NULL`) and `quota_error` (`NULL`), and `/admin/operations` showing no
`quota:error` candidate.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-runtime-freshness.test.mjs
- gate: test tests/operations-postgres.test.mjs (snapshot scoping; the planned separate suite was folded into the existing snapshot suite)
- gate: quality
- gate: build

### Verification Receipt

`npm run verify` PASS 12/12 gates in 179.6 s at the implementation tree: 1287/1287 tests, 0 skipped, PostgreSQL 20/20, quality 719 files, build PASS, both HTTP suites, recovery 15/15, finished 2026-11-25T02:41:31Z and recorded in `.verify/summary.json`. `tsc --noEmit` and `eslint` on the changed files exit 0; the three affected suites are 27/27. No live upstream probe is claimed.

### Convergence Receipt (read-only)

- `git rev-parse --short HEAD` → `f2e1a53`; `git status --short` → clean.
- Every file:line cited above was read at that commit; the quotations are
  verbatim from `read` output.

## Perfection Loop

### Loop 1 — RED

- **RED:** the capability sentinel and the freshness column disagree, so the
  predicate is unsatisfiable for a whole provider class. Evidence collected in
  §Detailed Description.
- **GREEN:** steps 1-5.
- **AUDIT:** every claim traced to a quoted line; no claim rests on a summary of
  a file read in an earlier session.
- **ADVERSARIAL:** the strongest counter-argument is "just delete the
  `ensureProviderObservation` call for non-subscription providers". Rejected on
  evidence: `beginProviderAdmission` consumes `status.rpm`, and
  `resolveProviderRpm` returns `null` when both ceilings are absent, which
  becomes a `unknown_ceiling` refusal — so the check is the *only* RPM source for
  these rows. The correct claim is not that the work is wasted; it is that the
  work is repeated. The original audit note in this session said admission
  already skipped quota for non-subscription providers; reading
  `lib/storage/admission.ts` showed no such branch, and the claim was withdrawn.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Does a non-subscription provider still produce a balance observation?**
   Only if `capabilities.balance` is true. `EMPTY_PROVIDER` defaults it true
   (`components/admin/provider-form.tsx:33`), and the seeds set it per provider,
   so in practice yes — but the predicate must handle `balance=false` without
   refreshing per call, which step 2 does.
2. **Should the sentinel string be kept for backwards compatibility?** No. It is
   written by one function and read by two; both are updated here, and a
   migration is unnecessary because the next check rewrites the column and the
   snapshot stops reading it for these rows.
3. **Does clearing `balance_observed_at` during a check still make sense?** Yes
   for the reason the original author gave ("while a check is in flight the
   stored observation is not evidence"), and it is now rare rather than constant.
   The capital page consequence is documented rather than hidden.

### Loop 2 — Independent audit and self-correction

- **RED:** step 4 as first drafted only filtered `errored`. Re-reading
  `snapshot.ts:157-171` showed an unfiltered row would then fall into the
  `quota_observed_at === null` branch and increment `unknown` instead — the same
  false alert with a different fingerprint (`quota:unknown`,
  `operations-rules.ts:107-118`). The fix must exclude the row from *all four*
  counters.
- **GREEN:** step 4 rewritten to scope every counter and `lowReserve`, with an
  explicit `unsupported` bucket.
- **AUDIT:** the display change in step 5 is required by that correction —
  `operations-cards.tsx:105-106` prints `current / enabledProviders`, which would
  otherwise read `1 / 2` for a healthy gateway with one non-quota provider.
- **ADVERSARIAL:** an operator could want a provider that *claims* subscription
  support but returns 401 to appear in the incident list. That behaviour is
  preserved: a genuine rejection still writes `quota_error`, and the capability
  flag remains the operator's declaration, not a probe result.
- **CHANGE DELTA:** ~12% of this record (the counters section and step list).

### Loop 3 — Final convergence

- **RED:** one residual risk: the three-case predicate must not report "current"
  for a balance-only provider whose last balance fetch *failed*, or admission
  would reuse a stale RPM indefinitely.
- **GREEN:** the balance-only case requires an error-free, recent
  `balance_observed_at`; a failed fetch leaves `error` set on the row, so the
  predicate returns false and the next call retries — the existing stale-on-
  failure rule does the right thing once the sentinel is gone.
- **AUDIT:** `completeRuntimeCheck` writes `error = ?` from the accumulated
  warnings (`runtime.ts:121`), so the failure is visible on the row and in
  `providers.status = 'error'` (`lib/storage/ledger/quota.ts:66-69` derives that
  status from `input.error`).
- **ADVERSARIAL:** "unsupported is silent, so a provider that silently stops
  reporting looks healthy." Answered: the `unsupported` count and the per-row
  capability flag are both on the page; what disappears is only the *false*
  incident for a row that never claimed the capability.
- **CHANGE DELTA:** <2% — converged.

## Resolution

- **Closed Date:** 2026-11-25
- **Fix Description:** `readRuntime` now writes `quota_error` only for a rejected
  fetch; absence of the capability is carried by `supports_subscription` alone.
  `providerObservationIsCurrent` picks the clock — subscription quota, recent
  balance, or nothing to observe — and `ensureProviderObservation` reads the
  status and both capability flags from one row (`getProviderObservation`), so a
  wallet-only account between checks is served with no lease claim, no outbound
  balance request and no pair of `providers` writes on the completion path. The
  operations snapshot selects `supports_subscription`, excludes those rows from
  `current`, `stale`, `unknown`, `errored` and `lowReserve`, and reports them in
  `quota.unsupported`; the panel's denominator is the quota-reporting count and
  it names how many providers report no quota. The SQLite-era sync copy that
  `lib/operations.ts` re-exports received the same rule so both read models
  agree.
- **Tests Added:** 5 cases in `tests/provider-runtime-freshness.test.mjs` (the
  three capability cases, an expired balance, error/in-flight, subscription
  precedence, and a store proof that a wallet-only check stores no error and is
  not repeated) plus a wallet-only row in the
  `tests/operations-postgres.test.mjs` snapshot fixture asserting
  `unsupported: 1` with every other counter unchanged. The planned
  `tests/operations-snapshot.test.mjs` was folded into that existing suite
  rather than duplicated.
- **Verification Evidence:** `npm run verify` PASS 12/12 gates, 1287/1287 tests,
  PostgreSQL 20/20, 179.6 s; focused `tsc --noEmit`, changed-file `eslint` and
  the three affected suites 27/27 all exit 0. No live upstream probe is
  claimed.
- **Commit SHA:** `cbfd07e` (`fix(providers): judge freshness by capability, not
  a quota sentinel (FID-2026-1124-003)`).
- **Archived:** 2026-11-25 → `dev/fids/archive/`

## Lessons Learned

A nullable column that carries both "no data" and "failure" cannot be used to
decide cache validity. When a new provider class is onboarded, every
`if (value)` guard on that column has to be re-read: `supports_subscription = 0`
is a declaration, and declaring a capability absent must never be expressible as
failure.
