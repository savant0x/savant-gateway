# FID: Verified TLS for provisioning helpers

**Filename:** `FID-2026-1104-007-provisioning-tls-verification.md`
**ID:** FID-2026-1104-007
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The disposable-database provisioning helper disables TLS certificate verification
for every non-loopback host while using the configured database credential. The
comment describes this as a test-data concession, but the code cannot distinguish
a disposable database from a production endpoint, so a mistargeted run sends a
real credential over an unverified channel.

## Environment

- Windows; Node v24.21.0; PostgreSQL; Next.js 16.4.3.
- Repository HEAD `aef6730`.
- Baseline: release audit finding 9.

## Detailed Description

### Problem

`scripts/with-supabase-postgres.mjs:151` returns
`{ rejectUnauthorized: false }` for any host that is not loopback, and the helper
connects with the configured database credential. The comment says verification
is not a security boundary "here", but nothing enforces the disposable scope.

### Expected Behavior

TLS verification stays on for every remote host, using the provider's CA or the
platform trust store. An untrusted certificate is refused with a clear error. A
loopback exception remains available for a local disposable server. Disposable
provisioning uses a role whose privileges cannot touch production data.

### Root Cause

Trust was disabled to work around a managed provider certificate that the local
environment did not trust. That is an environment problem, and the workaround was
applied to all remote hosts instead of the specific trust chain.

### Evidence

```text
scripts/with-supabase-postgres.mjs:151
return loopback ? undefined : { rejectUnauthorized: false };
```

## Impact Assessment

### Affected Components

- `scripts/with-supabase-postgres.mjs` and any copy of the connection helper.
- Disposable database provisioning for `verify:supabase` and `push:supabase`.
- The configured database credential and its role scope.

### Risk Level

- [x] High: a production credential can be presented to an unverified endpoint;
  a mistargeted environment variable is not caught.

## Proposed Solution

1. Remove the blanket `rejectUnauthorized: false`. Accept a CA from an explicit
   environment variable or rely on the platform trust store; require
   `sslmode=verify-full` semantics for remote hosts.
2. Keep the loopback exception only for `127.0.0.1`, `::1` and `localhost`.
3. Add a regression with a self-signed local TLS server that must be refused,
   and a trusted fixture that must connect. Refusal is a pass.
4. Provision with a least-privilege role for disposable databases; document that
   it must not own or write production schemas.

### Verification

RED: the helper connects to a self-signed endpoint with verification disabled.
GREEN: the same connection is refused with a certificate error, while the
loopback and trusted cases still succeed. `npm run config:check:prod` remains
PASS for the production inventory; no secret is printed.

### YAGNI

No certificate vendor, no new proxy, no application runtime change. The fix is
in the provisioning path only.

## Verification Gates

- gate: lint, typecheck, quality, build.
- gate: test_postgres — `npm run test:postgres` on a disposable endpoint.
- gate: verify — `npm run verify:supabase`.
- gate: config_check_prod — `npm run config:check:prod`.

**Planned artifact:** the TLS regression is a new test file under `tests/`, named
by the worker at implementation time; no such path exists at convergence. Its
gate line becomes active with the implementation commit, and this record does not
claim it ran.

### Verification Receipt

- verified: not yet — design converged, implementation pending.

## Perfection Loop

### Loop 1 — RED

- **RED:** all remote hosts skip certificate verification.
- **GREEN:** trust store or explicit CA; loopback-only exception.
- **AUDIT:** the helper is the only place with this fallback; the comment does
  not constrain scope.
- **ADVERSARIAL:** a CA pinned to the wrong hostname still fails; verification
  must include hostname checking, not just chain trust.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Is the Supabase pooler certificate publicly trusted?** The recorded local
   failure suggests the workstation trust store, not a universally untrusted
   chain. Prefer a documented CA over disabling verification.
2. **Would `sslmode=require` verify?** Not necessarily; libpq-compatible
   semantics can encrypt without verification. Require verify-full behavior.
3. **Does this block `verify:supabase`?** It can, until the CA is configured.
   That is the correct failure direction.

### Loop 2 — Independent audit and self-correction

- **RED:** a hard verify-full requirement could break the disposable workflow on
  a machine without the provider CA.
- **GREEN:** the helper reads an explicit CA variable and prints a remediation
  message; it never silently downgrades.
- **AUDIT:** provisioning output already redacts the connection string.
- **ADVERSARIAL:** a loopback server can still present any certificate; that is
  acceptable because no network boundary is crossed.
- **CHANGE DELTA:** 4%.

### Loop 3 — Final convergence

- **RED:** production and disposable runs could share one role.
- **GREEN:** least-privilege role is part of the acceptance, not a note.
- **AUDIT:** no production credential is read by the new test.
- **ADVERSARIAL:** error text must not echo the connection string or password.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Pending. Coding is reserved to the operator's separate worker.

- [ ] Commit SHA, file ranges, gate output, step statuses.
- [ ] Refusal and trusted-connection receipts.

## Code Verification Evidence

- [x] The helper and fallback line were read.
- [x] Status reflects reality: `converged`.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Next action:** worker implements verified TLS, the CA input and the refusal
  regression; operator confirms the disposable role scope.
- **Archived:** no.

## Lessons Learned

A workaround for one machine's trust store became a blanket trust decision. Scope
the concession to loopback, and make refusal the default.
