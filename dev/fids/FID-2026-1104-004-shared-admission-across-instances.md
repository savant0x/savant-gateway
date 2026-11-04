# FID: Shared admission across application instances

**Filename:** `FID-2026-1104-004-shared-admission-across-instances.md`
**ID:** FID-2026-1104-004
**Severity:** critical
**Status:** converged
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

- verified: not yet — design converged, implementation pending.

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

Pending. Coding is reserved to the operator's separate worker.

- [ ] **Commit SHA:** not yet.
- [ ] **File:line ranges:** not yet.
- [ ] **Gate output:** not yet.
- [ ] **Reproducibility:** RED probe defined above.
- [ ] **Step statuses:** all design-only; none `implemented`.

## Code Verification Evidence

- [x] Referenced files exist and the call path was inspected.
- [x] The probe result is recorded, not inferred.
- [ ] Typecheck/tests/lint — pending implementation.
- [x] Status reflects reality: `converged`.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Next action:** operator topology ruling, then the worker implements the
  shared lease and the two-instance proof.
- **Archived:** no.

## Lessons Learned

A module-level counter is a per-instance promise. On a multi-instance host, an
unenforced single-process assumption is the failure mode, not the design.
