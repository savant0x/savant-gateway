# FID: Security boundaries, isolation and secret-safe errors

**Filename:** `FID-2026-1030-047-security-and-account-isolation.md`
**ID:** FID-2026-1030-047
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** none
**YAGNI-Compliance:** Verified — audit and extend existing guards and ownership checks.

## Summary

Prove customer/admin isolation, session/key revocation, same-origin checks and
safe public/error/log boundaries. Retain real authentication and correct stale
security documentation; do not describe test fixtures as production credentials.

## Environment

`lib/admin-auth.ts`, `lib/customer-auth.ts`, customer/key/session stores,
`lib/http.ts`, provider registry/requests and `SECURITY.md`.

## Detailed Description

### Problem / expected behavior / root cause

Ordinary isolation tests exist, but a complete trust-boundary audit is missing.
`SECURITY.md` still describes only a Host-based guard; `lib/admin-auth.ts:24`
disables that bypass in production and uses real sessions. Current raw exception
logging (`lib/http.ts`) and stored upstream errors need secret-safety proof.

### Evidence

`guardAdminApi` checks same origin/session; `guardLocalOrAdmin` keeps a dev-only
bypass. The HTTP suite proves one cross-account key deletion denial, not every
ownership operation. Login's `dummyHash()` intentionally equalizes password work.
Provider base URLs/default headers are operator-controlled outbound boundaries.

## Impact Assessment

Every privileged/customer API, proxy/Host handling, data serialization, provider
network access and rotation procedures. Risk critical: cross-account data or
secrets must never be exposed. Preserve existing key hashes and session revocation.

## Proposed Solution

### Approach and steps

1. Build route/store ownership and credential-flow inventory, including suspended
   accounts, expiry, revoked keys, cookie settings, console and admin mutations.
2. Exercise spoofed Host/origin/forwarded headers, unauthorized reads/writes and
   all cross-account data paths; repair gaps with existing shared guards.
3. Apply safe diagnostics to public responses, durable usage errors and logs;
   test canary secrets without printing them. Validate outbound URL/header policy
   for SSRF, redirects and credentials at configured provider boundaries.
4. Test password/secret rotation and session/key revocation; update SECURITY to
   actual behavior. Retain timing equalization and generic login failures.

### Verification

Extend `tests/admin-session.test.mjs`, `tests/customer-session.test.mjs`,
`tests/http.test.mjs`; planned `tests/security-boundaries.test.mjs`. HTTP matrix
must cover all scoped resources and production console endpoints. Intended chain:
route/page guards → authenticated identity → user-scoped store; diagnostics use
one redaction policy. Real network/ingress settings are finally verified by 057.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the existing files and planned `tests/security-boundaries.test.mjs`. Require
redacted negative HTTP, serialization, outbound-network and rotation receipts.

## Perfection Loop

RED: incomplete boundary coverage and stale security narrative. GREEN: real
negative cases and shared guards/redaction. AUDIT: pending. ADVERSARIAL: a
configured upstream can return a credential in exception text; public sanitizing
alone is insufficient. Five questions: every ownership path, hostile inputs,
bounded checks, revocable identity and maintainable one-truth diagnostics.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: inspect response, usage error, sync
status and logging destinations independently; a generic HTTP error alone is
not redaction proof. Canary comparisons must never print the canary value.
Final convergence checks are in the master planning-audit receipt.

Design only. Findings must be proven before being labelled repaired; the
existing production session layer must not be replaced by a weaker host check.

## Lessons Learned

Correct auth code and accurate security documentation need independent evidence.
