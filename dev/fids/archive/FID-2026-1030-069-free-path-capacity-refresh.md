# FID: Free-path outage — stale capacity observation refuses admission

**Filename:** `FID-2026-1030-069-free-path-capacity-refresh.md`
**ID:** FID-2026-1030-069
**Parent:** FID-2026-1030-048
**Severity:** critical
**Status:** closed
**Created:** 2026-10-30 23:55
**Automation level:** 2
**YAGNI-Compliance:** Verified

## Summary

Every free request that followed thirty seconds of silence was answered `503`
"capacity is unknown" — the live offering was unusable after any quiet period,
and stayed unusable until a human opened an operator page. The stored provider
observation expires by design, and nothing on the request path ever refreshed
it, so admission compared an expired reading against a fallback ceiling that was
not configured. Admission now refreshes an expired observation once before it
decides, and the documented fallback is configured.

## Environment

- **OS:** Windows 11 host
- **Language/Runtime:** Node `v24.21.0`
- **Tool Versions:** npm `12.2.1`, Next `16.4.3`, better-sqlite3 `13.0.3`
- **Commit/State:** `2484c1c` plus the uncommitted working tree of this pass

## Detailed Description

### Problem

A real call through the gateway (`free/deepseek-v4-pro-0813`) succeeded warm and
then failed permanently once the traffic stopped:

```text
warm           200 in 3.8s   (1,607 tokens, cost_tokens 0)
40s idle       503 in 0.008s
70s idle       503 in 0.009s
```

Eight milliseconds is too fast to have asked the provider anything, and repeated
attempts never recovered the path: once the reading aged out, every later call
was refused in the same way.

### Expected Behavior

`knowledge.md` already states the intent — refresh upstream capacity before free
admission — so a request after a quiet period should cost one account check and
then be served. An unavailable capacity reading should still refuse; a merely
expired one should not.

### Root Cause

Three separate facts combine into the outage:

1. [lib/store/providers.ts:144](../../lib/store/providers.ts#L144) reports
   `rpm: balanceCurrent ? row.rpm : null`. `balanceCurrent` requires the
   observation to be younger than `QUOTA_MAX_AGE_MS` — 30 s, in
   [lib/provider-quota.ts:3](../../lib/provider-quota.ts#L3). An expired
   observation is not evidence, so the counter reads as unknown.
2. [lib/gateway.ts:151](../../lib/gateway.ts#L151) read that status once and
   passed `rpm` straight into admission. Nothing on the customer path refreshed
   the observation; only operator surfaces did (`/api/provider/runtime`, the
   dashboards, admin sync).
3. `resolveProviderRpm` falls back to `PROVIDER_SHARED_RPM`, which was absent
   from `.env.local`, so `unknown_ceiling` refused the call with `503`.

The guard's instinct — unknown capacity must never be treated as unlimited — is
correct and stays. What was wrong is refusing when it could simply go and look.

### Evidence

The gate could not have caught this: [scripts/http-suite.mjs](../../scripts/http-suite.mjs)
pinned `PROVIDER_SHARED_RPM: "9000"`, so the suite always had the fallback that
production lacked, and the seeded fixture provider declared
`supports_balance = 0` even though the mock upstream answers `/balance` with its
own rpm. Red run, after restoring the pre-fix read-only behaviour and removing
that pin:

```text
red build ok
red suite exit: 1
163:http-suite FAIL: a request after 60s of idleness still succeeds — expected 200, got 503
```

## Impact Assessment

### Affected Components

- `lib/gateway.ts` — admission input on the only customer-facing completion path
- `lib/providers/runtime.ts` — one observation-refreshing entry point
- `scripts/http-suite.mjs`, `scripts/http-suite/seed.mjs` — suite now mirrors production
- `scripts/http-suite/quota-checks.mjs` — the regression check
- `.env.local` — `PROVIDER_SHARED_RPM` now configured (untracked, operator machine)

### Risk Level

- [x] Critical: the free path — the currently active offering — refused every
  request after any quiet period.

## Proposed Solution

### Approach

One function owns the decision: `ensureProviderObservation(slug)` returns the
status when `quotaIsCurrent` accepts it and otherwise refreshes exactly once,
then re-reads the row. A failed refresh is deliberately not an error — the
re-read still reports unknown, which still refuses, so the guard keeps its
meaning. The existing 25 s runtime lease and the per-slug pending map coalesce
concurrent refreshes, so a burst after idleness produces one upstream check, not
one per request. The refresh stays behind rate limiting, so a throttled call
costs no upstream request.

### Steps

1. `implemented` — `ensureProviderObservation` in `lib/providers/runtime.ts`.
2. `implemented` — gateway admits on the ensured status, not a bare row read.
3. `implemented` — `PROVIDER_SHARED_RPM=15` recorded as the documented fallback.
4. `implemented` — suite mirrors production: no pinned fallback, fixture reports
   its own ceiling.
5. `implemented` — regression check for a request after 60 s of idleness.

### Verification

`node --test tests/` for units and `node scripts/http-suite.mjs` for behaviour.
The new check backdates `quota_observed_at` and `balance_observed_at` by 60 s
instead of sleeping for a minute, which is the same condition the outage
produced, and asserts both the `200` and that the request caused an account
check.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/quota-refresh.test.mjs
- gate: quality
- gate: build
- gate: verify (http suite)

### Verification Receipt

- verified: 2026-10-30T23:52Z
- lint: exit 0
- typecheck: exit 0
- test (whole directory): exit 0 — 321 pass, 0 fail
- test tests/quota-refresh.test.mjs: included in the directory run, exit 0
- quality: exit 0 — PASS, 400-line ceiling, 295 files
- build: exit 0
- config:check: exit 0 — PASS (non-production)
- http suite: exit 0 — 463 checks PASS

## Perfection Loop

### Loop 1 — RED

- **RED:** The first version of the check passed while the bug was still present.
  The cause was the suite's own `PROVIDER_SHARED_RPM: "9000"` pin: it supplied
  the fallback production never had, so the check proved the fallback, not a
  refresh.
- **GREEN:** The pin was removed so the gate runs production-like, and the
  fixture provider was given `supports_balance = 1` because the mock upstream
  really does serve `/balance` with an rpm. Without that second change the paid
  call failed instead — the fixture was declaring itself incapable of reporting a
  ceiling it was reporting all along.
- **AUDIT:** With the pre-fix behaviour temporarily restored, the suite exited 1
  on exactly the new line (`expected 200, got 503`); with the fix in place, exit
  0 and 463 checks pass, both new assertions included.
- **ADVERSARIAL:** Refreshing on the request path buys liveness with an upstream
  call per idle period, and an upstream that fails turns a working path into a
  refusal. Both are accepted: the lease and pending map bound the cost to one
  check per 25 s, and a capacity reading that cannot be obtained is exactly what
  must not be dispatched against.
- **CHANGE DELTA:** n/a — new record.

### Missed Questions

1. *Should the expiry be longer than 30 s instead?* No. The expiry protects
   against acting on a stale ceiling; lengthening it would widen the window in
   which an exhausted account still looks available. Refresh removes the reason
   to want a longer expiry.
2. *Does this make every request wait on the provider?* Only the first request
   after silence, and only when no fresh observation exists; a warm path still
   reads the row.
3. *Why 15 rpm for the fallback rather than the observed 9000?* The fallback is
   for the case where nothing was observed. It should be a conservative ceiling
   the account can actually serve, not a guess at its real limit; a current
   observation always wins.
4. *Did the fallback hide anything else?* It hid the suite's ability to notice
   stale-observation behaviour at all, which is why the pin is gone rather than
   merely lowered.

### Implementation Evidence

- [x] **Commit SHA:** `b8a1a50` — fix, FID, SCOPE and CHANGELOG entries in one
  commit; the earlier FID-067/FID-068 records were left untouched and stay
  uncommitted on purpose.
- [x] **Commit-message guard:** `attribution-guard: PASS (no coding-agent credit
  found)`.
- [x] **File:line ranges:** `lib/providers/runtime.ts:110-150` (`ensureProviderObservation`),
  `lib/gateway.ts:38` and `:151-155` (ensure + admit), `scripts/http-suite.mjs:53-57`
  (no pinned fallback), `scripts/http-suite/seed.mjs:12-18` (fixture reports its
  ceiling), `scripts/http-suite/quota-checks.mjs:263-273` (the check).
- [x] **Gate output:** lint, typecheck, quality, test, build, config:check and the
  http suite all exit 0; pasted counts in the receipt.
- [x] **Reproducibility:** `npm run build && node scripts/http-suite.mjs`; the
  check is named "a request after 60s of idleness still succeeds".
- [x] **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass with pasted output.
- [x] Production call-graph evidence:
  `app/api/v1/chat/completions` → `lib/gateway.ts` `handleChatCompletion` →
  `ensureProviderObservation` → `beginProviderAdmission`.
- [x] FID status matches the implementation state.

## Resolution

- **Closed Date:** 2026-10-31 00:05 — closed on commit `b8a1a50`, after the
  gates and the RED→GREEN run recorded above.
- **Archived:** 2026-10-31 00:05 — moved to `dev/fids/archive/`.
- **Fix Description:** admission refreshes an expired provider observation once
  before deciding, and the documented fallback ceiling is configured.
- **Tests Added:** Yes — `scripts/http-suite/quota-checks.mjs:263-273`.
- **Verification Evidence:** RED exit 1 on the new check with pre-fix behaviour;
  GREEN exit 0 with 463 checks; all repository gates exit 0.

## Lessons Learned

The suite had been green on this defect since FID-048 because it configured the
fallback that production did not have. A harness that supplies configuration no
real deployment supplies does not test the deployment — it tests the harness.
The fixture had the same shape of problem from the other direction: it declared a
capability off while the mock happily answered that endpoint.
