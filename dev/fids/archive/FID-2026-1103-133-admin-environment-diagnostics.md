# FID: Safe admin environment diagnostics

**Filename:** `FID-2026-1103-133-admin-environment-diagnostics.md`
**ID:** FID-2026-1103-133
**Severity:** low
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Admin setup failures are difficult to diagnose because the login screen does not
show whether the password, session secret, origin, or runtime mode is configured.
Add a safe diagnostic view that reports only configuration state and lengths,
never values or derived secrets.

## Impact Assessment

- **Affected components:** `lib/admin-session.ts`, admin login page and screen,
  configuration checks, admin session tests and documentation.
- **Risk:** low usability improvement with high sensitivity to information leaks.

## Proposed Solution

1. **implemented (design):** expose a typed server-side diagnostic projection:
   configured/valid booleans, length bands, runtime mode, and current origin.
2. **implemented (design):** render it only on the unauthenticated admin login
   setup state, with plain-language remediation.
3. **implemented (design):** test absent, short, valid, quoted, and malformed
   environment values while asserting no secret substring is rendered or logged.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** operators cannot distinguish missing configuration from bad input.
- **GREEN:** a narrow diagnostic projection gives actionable state without values.
- **AUDIT:** trace `readAdminConfig` into login rendering and confirm no client
  environment access exists.
- **ADVERSARIAL:** secrets in HTML, hydration data, logs, error messages,
  length side channels, and spoofed origin must be addressed.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should password length be exact?** Prefer validity bands to reduce leakage.
2. **Should diagnostics appear in production?** Yes, but only safe state and
   only on the login screen.

## Implementation Evidence

- **Commit SHA:** `4b57ebe`.
- **Implementation:** `lib/admin-diagnostics.ts` returns configuration bands,
  a normalized origin and production issue codes; the login screen renders the
  state with remediation. No secret value is serialized.
- **Tests Added:** Yes — `tests/admin-diagnostics.test.mjs` covers absent,
  short, valid, quoted and malformed values and asserts no secret substring is
  present in the projection.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the projection was not rendered against the hosted
  deployment in this session; the tests verify the server-side values only.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** operators can distinguish missing configuration from bad
  input without exposing a password, secret or raw origin credentials.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-133-admin-environment-diagnostics.md`.
