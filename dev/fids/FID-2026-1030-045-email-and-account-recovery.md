# FID: Email ownership and account recovery

**Filename:** `FID-2026-1030-045-email-and-account-recovery.md`
**ID:** FID-2026-1030-045
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — extend existing customer identity and sessions.

## Summary

Provide real email verification and password recovery without turning an email
address or a browser redirect into proof of ownership. A delivery provider and
controlled mailbox are required for external acceptance, not for code preparation.

## Environment

`lib/store/customer.ts`, `lib/customer-session.ts`, auth routes and account UI.
Existing scrypt hashes and revocable opaque sessions must remain compatible.

## Detailed Description

### Problem / expected behavior / root cause

No verification delivery or password reset exists. `lib/trial-ledger.ts:61-71`
requires `email_verified_at`; a grant cannot be enabled truthfully without its
writer. Recovery must not let an attacker replace another customer's password.

### Evidence

Auth route inventory has signup/login/logout/me only. The verified-email search
finds the ledger read, not a verification writer. `docs/trial-system-audit.md`
documents this missing production capability; local seeded verification is not delivery.

## Impact Assessment

Add hashed, single-use, purpose-bound expiring tokens and schema migrations;
extend auth forms/routes/customer store. Risk high: account takeover and enumeration.
Operator chooses transport/domain and supplies secrets outside the tree.

## Proposed Solution

### Approach and steps

1. Reuse customer IDs, hashing/session patterns and additive schema helpers.
   Persist only token hashes with purpose, expiry and consumed state.
2. Add request/consume/resend verification and recovery routes with bounded
   retries and generic request responses; never mark verified on request/delivery.
3. Atomically consume the token and update ownership/password state. Reset revokes
   existing sessions; password change cannot silently preserve stolen access.
4. Wire signup/account/recovery UI to real delivery and consumption. Record
   retryable delivery failure honestly; do not accept a token from another origin.

### Verification

Planned new `tests/account-recovery.test.mjs`: expiry, wrong purpose, replay,
concurrent consumption, token hashing, revocation and enumeration-safe response.
Extend the production HTTP suite for route/UI writer reachability. Intended chain:
auth request → token store → email transport → consume route → customer update.
Use controlled mailbox evidence for delivery/link consumption; fixtures remain regression.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`, with `npm test`
including planned `tests/account-recovery.test.mjs` once implemented. HTTP
coverage must execute consumption and prove the database update/session revocation.
External receipt: received message and consumed link without exposing tokens.

## Perfection Loop

RED: absent delivery/ownership writer. GREEN: single-use token lifecycle and real
transport. AUDIT: pending. ADVERSARIAL: reused links, resend races and account
enumeration must fail safely. Five questions: bound send volume, handle all token
states, resist takeover, centralize token rules and retain auditable ownership transitions.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: bind tokens to account, purpose and
current email; email change/resend invalidates superseded tokens atomically.
Test delivery retries separately from token replay and never expose raw tokens
in logs. Final convergence checks are in the master planning-audit receipt.

Design only; transport selection and controlled inbox are operator inputs.
Trial activation is owned by 049 and cannot follow merely from adding a form.

## Lessons Learned

An email column and a verification label are not an ownership-verification system.
