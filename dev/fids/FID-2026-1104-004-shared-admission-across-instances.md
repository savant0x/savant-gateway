# FID: Shared admission across application instances

**Filename:** `FID-2026-1104-004-shared-admission-across-instances.md`
**ID:** FID-2026-1104-004
**Severity:** critical
**Status:** converged — implementation landed; closure blocked on the mandatory two-connection proof
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Provider and customer admission state lives in module-level `Map`s, so every
application instance enforces its own ceiling. The recorded production topology
is Vercel with Neon, where more than one request-scoped instance can serve
traffic; the documented single-process contract is then an assumption, not an
enforcement. A local probe loaded the production helper twice with the same
provider identity and confirmed both copies admit independently.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; PostgreSQL (Neon in production).
- Repository HEAD `aef6730`.
- Baseline evidence: `dev/audits/2026-11-04-release-readiness.md` finding 1.

## Detailed Description

### Problem

`lib/provider-admission.ts:63` keeps serving-account capacity in a module Map;
`lib/gateway-rate-limit.ts:66` does the same for free and per-account buckets;
`lib/admin-rate-limit.ts:18` keeps login windows in memory. The production
caller is `lib/storage/gateway/call.ts`. `lib/production-config.ts:221` checks
conventional worker variables, which does not establish that a platform serves
one application instance.

An isolated-process probe loaded the admission helper twice with one provider
identity and a configured RPM and concurrency of one. Both processes returned
`ok: true`. That proves state isolation, not a measured hosted overload.

### Expected Behavior

One aggregate ceiling per serving provider account and per customer bucket,
regardless of how many instances run, or an explicitly enforced single-instance
topology that refuses to start when the assumption cannot hold.

### Root Cause

Admission decisions are computed from non-shared memory. Nothing coordinates
instances, and no durable lease carries the admitted request. Restart or a
second instance resets or duplicates the budget.

### Evidence

```text
lib/provider-admission.ts:63   module-level accounting Map
lib/gateway-rate-limit.ts:66   module-level free/account buckets
lib/admin-rate-limit.ts:18     module-level login windows
lib/storage/gateway/call.ts    production caller
probe: two loads, same identity, rpm=1 concurrency=1 -> both ok:true
```

## Impact Assessment

### Affected Components

- `lib/provider-admission.ts`, `lib/gateway-rate-limit.ts`, `lib/admin-rate-limit.ts`.
- `lib/storage/gateway/call.ts` and the storage ledger.
- Deployment configuration for Vercel and any fallback host.

### Risk Level

- [x] Critical: aggregate upstream ceilings can be exceeded, producing provider
  429s and unfair free/account consumption. No direct ledger loss is asserted.

## Proposed Solution

### Approach

Choose the topology first, then make the chosen contract executable. Prefer a
shared PostgreSQL authority because Vercel is the recorded host; keep financial
holds, provider capacity and customer fairness separate.

### Steps

1. **Operator decision: shared authority or enforced single instance.** Record
   the ruling in SCOPE. A single-instance choice requires a startup fence and a
   deployment check, not a comment.
2. **Atomic shared acquire.** Add bounded, expiring leases per provider account
   and per customer bucket in PostgreSQL. One transaction must check the window,
   insert the lease and return admit/refuse; expiry must free capacity without
   a sweeper dependency.
3. **Preserve the existing separation.** Provider capacity, free/account
   fairness and admin-login windows keep independent keys and failure modes.
   A shared store must not merge them into one counter.
4. **Two-instance proof.** Boot two `next start` processes on one disposable
   database, send concurrent calls with RPM 1 and concurrency 1, and require
   exactly one admission. Release leases and assert no residue.
5. **Measure the added cost.** Record the transaction latency against the
   capacity envelope before accepting the design; a per-call cost that breaks
   the measured budget is a failed design, not a tuning note.

### Verification

RED: the two-instance harness admits both copies today. GREEN: exactly one
admission, one refusal, correct retry metadata, lease expiry recovers capacity,
and the ledger is unchanged. The proof uses real connections and a disposable
database, never PGlite.

### YAGNI

No new service, cache or dependency. No change to billing source, pricing or
customer-visible limits. The existing PostgreSQL handle is the only new
authority.

## Verification Gates

- gate: test tests/provider-admission.test.mjs
- gate: test tests/rate-limit.test.mjs
- gate: test tests/admin-rate-limit.test.mjs
- gate: test tests/gateway-e2e-postgres.test.mjs
- gate: test_postgres — `npm run test:postgres` with the two-instance proof added.
- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify:supabase` when the full set is claimed.

**Planned artifact:** the two-instance proof extends
`scripts/postgres-concurrency-proof.mjs`; that path exists. No new test file is
promised at convergence.

### Verification Receipt

- verified: partial — 2026-11-04
- typecheck: exit 0
- lint: exit 0 (zero warnings)
- test: 982 pass, 0 fail, 4 skipped (all PostgreSQL-only)
- quality: PASS (599 files, 400-line ceiling)
- build: exit 0
- test:postgres: BLOCKED — Docker engine returned 500; `TEST_DATABASE_URL` unset
- two-instance proof: not run; no aggregate-ceiling claim is made

## Perfection Loop

### Loop 1 — RED

- **RED:** per-instance Maps, no durable lease, no startup fence.
- **GREEN:** shared atomic acquire with bounded expiry, or an enforced
  single-instance contract if the operator rules that way.
- **AUDIT:** the probe proves two loads admit independently; the caller is the
  production gateway path.
- **ADVERSARIAL:** a lease without an owner fence can be renewed by a paused
  instance after expiry. Leases need an owner id and must be treated as lost,
  not extended, once expired.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does Vercel guarantee one instance?** No. Request-scoped functions can
   overlap; only an explicit platform constraint would make the assumption true.
2. **Can this be solved with a Next.js cache handler?** No. These are custom
   Maps, not framework cache entries.
3. **Should the shared store also hold credit holds?** No. Financial holds
   already have their own transactional authority; merging them changes
   settlement semantics for no admission benefit.
4. **What happens during a database outage?** Admission fails closed with a
   bounded retry, not an unbounded queue.

### Loop 2 — Independent audit and self-correction

- **RED:** a lease row per admitted request can grow without bound under load.
- **GREEN:** leases are short-lived and deleted on settlement; expired rows are
  reclaimed in the same acquire transaction.
- **AUDIT:** the existing settlement path can attach the lease id without a new
  table for money.
- **ADVERSARIAL:** hot-row contention at the provider key could serialize all
  traffic. The design must measure that, and prefer a window row plus bounded
  retry over a single global mutex.
- **CHANGE DELTA:** 7%.

### Loop 3 — Final convergence

- **RED:** an operator could accept the design and deploy before the cost check.
- **GREEN:** step 5 is a gate, not advice; the load receipt names the added
  latency.
- **AUDIT:** no customer-visible limit changes; refusals keep the existing
  status and headers.
- **ADVERSARIAL:** a failed shared store must not degrade to per-instance
  admission. Refuse, do not fall back.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Implementation landed 2026-11-04. The mandatory two-instance PostgreSQL proof is
still blocked, so this record is not closed and no cross-instance safety is
claimed.

- [ ] **Commit SHA:** recorded in the follow-up receipt commit.
- [x] **File:line ranges:**
  - `lib/storage/schema/admission.ts:14` — `admission_buckets` and
    `admission_leases`, additive and idempotent.
  - `lib/storage/admission.ts:71` — `acquireSharedProviderAdmission`; one
    transaction locks the bucket row, reclaims expired leases, inserts the new
    lease and returns the decision.
  - `lib/storage/admission.ts:222` — `takeSharedCompletionRate`; the same row
    lock for one completion token.
  - `lib/provider-admission.ts:158` — pure `evaluateProviderAdmission`, the
    single decision implementation used by the store and the unit suite.
  - `lib/gateway-provider-admission.ts:48` — completion and provider refusal
    shapes; `:77` — async lease acquisition.
  - `lib/storage/gateway/call.ts:170` — awaited shared rate limit; `:179` —
    shared provider admission before any billing reservation.
  - `lib/storage/gateway/stream.ts:50,144` — async lease release transferred
    to the stream and awaited after settlement.
- [x] **Gate output:** 2026-11-04 — `npm run typecheck` exit 0; `npm run lint`
  exit 0, zero warnings; `npm test` 986 tests, 982 pass, 0 fail, 4 skipped
  (all four PostgreSQL-only proofs); `npm run quality` PASS (599 files);
  `npm run build` exit 0.
- [x] **Reproducibility:** `grep -n acquireSharedProviderAdmission
  lib/storage/admission.ts` and `grep -n takeSharedCompletionRate
  lib/storage/gateway/call.ts` find the production call path.
- [ ] **Step statuses:** 1 operator topology ruling recorded (SCOPE A24);
  2 implemented; 3 implemented — admin login windows remain a separate
  in-memory login surface, not a gateway bucket; 4 `blocked` — Docker engine
  unavailable and `TEST_DATABASE_URL` unset; 5 `blocked` — cost measurement
  needs the same real database. No step is claimed passed without its proof.

## Code Verification Evidence

- [x] Referenced files exist and the call path was inspected.
- [x] The probe result is recorded, not inferred.
- [x] Typecheck/tests/lint — typecheck 0, lint 0, 982 pass, 0 fail.
- [ ] Two-connection PostgreSQL proof — blocked by the environment.
- [x] Status reflects reality: implementation landed; not closed.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Implementation Date:** 2026-11-04
- **Next action:** run `npm run test:postgres` with a disposable PostgreSQL
  endpoint, attach the two-instance result, then record step 5's added latency
  and close the record. Do not claim a shared ceiling until that receipt exists.
- **Archived:** no.

## Lessons Learned

A module-level counter is a per-instance promise. On a multi-instance host, an
unenforced single-process assumption is the failure mode, not the design.
