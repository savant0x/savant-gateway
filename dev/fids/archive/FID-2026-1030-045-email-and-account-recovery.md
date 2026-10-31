# FID: Email ownership and account recovery

**Filename:** `FID-2026-1030-045-email-and-account-recovery.md`
**ID:** FID-2026-1030-045
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** closed
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

- gate: test tests/account-recovery.test.mjs

Planning audit under 043. Implementation: `npm run verify`, with `npm test`
including planned `tests/account-recovery.test.mjs` once implemented. HTTP
coverage must execute consumption and prove the database update/session revocation.
External receipt: received message and consumed link without exposing tokens.

## Perfection Loop

RED: absent delivery/ownership writer. GREEN: single-use token lifecycle and real
transport. AUDIT: pending. ADVERSARIAL: reused links, resend races and account
enumeration must fail safely. Five questions: bound send volume, handle all token
states, resist takeover, centralize token rules and retain auditable ownership transitions.

## Implementation Evidence

- **Commit SHA:** `871f19e` — `feat(auth): implement email verification and
  recovery (FID-2026-1030-045)`, 27 files, 1323 insertions.
- **File:line ranges:**
  - `lib/schema/account-actions.ts:3` — `account_actions` table, purpose and
    delivery-state checks, one-active-action unique index.
  - `lib/account-actions.ts:26` issue (three/hour, resend supersession),
    `:76` delivery state, `:95` atomic consume with password reset, session/key
    revocation and outstanding-action invalidation.
  - `lib/account-email.ts:12` opt-in configuration with canonical origin and
    pinned production endpoint, `:69` Resend POST with idempotency key, two
    bounded attempts and no provider-text logging.
  - `app/api/auth/email/request/route.ts:29` and
    `app/api/auth/email/consume/route.ts:17` — same-origin, rate-bounded,
    bounded-JSON routes; reset delivery runs in `after` so transport latency
    cannot disclose account existence.
  - `app/account/page.tsx:156`, `app/recover/page.tsx:12`,
    `app/account/action/page.tsx:11`,
    `components/account/email-verification-card.tsx:8`,
    `components/account/recovery-form.tsx:9`,
    `components/account/account-action-form.tsx:10`,
    `components/account/auth-form.tsx:197`.
  - `tests/account-recovery.test.mjs:31-159` — nine cases including the
    two-process consumption race.
  - `scripts/http-suite/account-recovery-checks.mjs:34` — 25 production HTTP
    checks against a Resend-shaped double.
- **Gate output:** `npm run verify` exit 0 on `871f19e`: 344 unit tests,
  quality PASS (400-line ceiling, 319 files), production build, 642 HTTP checks
  PASS, trial suite PASS, recovery drill PASS (7 concurrent writes, 1911 ms).
- **Reproducibility:** `grep -rn "account_actions" lib app tests scripts`
  returns the schema, ledger, routes, UI and both suites; the table is created
  by `lib/db.ts` through `accountActionSchema`.
- **Step statuses:** 1 implemented, 2 implemented, 3 implemented,
  4 implemented.

## Resolution

- **Closed Date:** 2026-10-31
- **Fix Description:** Hash-only, single-use, purpose/email-bound action tokens
  with expiry and delivery state; authenticated verification request, public
  enumeration-safe recovery request and same-origin consume routes; atomic
  ownership write and password reset that revokes sessions, keys and other
  actions; opt-in Resend transport; verification card, recovery page and
  fragment-driven confirmation page.
- **Tests Added:** Yes — `tests/account-recovery.test.mjs` (nine cases,
  including an independent-process replay race) and the production HTTP
  recovery checks.
- **Verification Evidence:** `npm run verify` exit 0 with the counts above;
  `npm run lint` and `npm run typecheck` exit 0 after the final formatting edit;
  attribution guard PASS.
- **Archived:** 2026-10-31

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: bind tokens to account, purpose and
current email; email change/resend invalidates superseded tokens atomically.
Test delivery retries separately from token replay and never expose raw tokens
in logs. Final convergence checks are in the master planning-audit receipt.

Live acceptance remains `FID-2026-1030-045-LIVE` in the tracking ledger:
sender configuration, controlled inbox receipt and the privacy recipient
disclosure are operator inputs. Trial activation is owned by 049 and cannot
follow merely from adding a form.

## Lessons Learned

An email column and a verification label are not an ownership-verification system.

## Execution audit — 2026-10-31

RED: `users.email_verified_at` has readers but no production writer; customer
password/session primitives exist, but no action-token table or recovery route.
046 now supplies bounded body parsing and ingress identity. No email transport
is configured or authorized for a real delivery exercise.

GREEN: add a handle-injected action-token ledger with hashed 32-byte tokens,
account/current-email/purpose binding, single use, expiry and delivery status.
Issue at most three actions/account/purpose/hour in an immediate transaction;
resend atomically invalidates earlier same-purpose tokens. Verification requires
the authenticated account; recovery requests are public, rate-bounded and use
identical generic responses for known/unknown accounts and delivery failures.
Reset consumes and changes the password in one transaction, revokes all sessions
and keys and invalidates outstanding actions. Verification consumes and writes
ownership atomically. No redirect or email send alone establishes ownership.

Add an explicitly configured Resend REST adapter (no new package), disabled
until the operator selects it with EMAIL_TRANSPORT=resend and supplies sender,
key and canonical origin. This implements an available transport without
provisioning a service or selecting a commercial account for the operator.
Use the documented POST /emails contract, idempotency keys, bounded deadlines
and one retry on transient failure. Persist failure state with fixed diagnostics;
never store/send raw tokens in logs or API responses. Link tokens live in URL
fragments and are removed from browser history on load; consumption is POST,
so scanners and link previews cannot consume them. GET pages perform no writes.

AUDIT: production callers will be authenticated account verification request,
public recovery request and action-consume routes; account/login links and the
action page call those routes. Injected database tests prove hashing, expiry,
wrong purpose/email, supersession, concurrent replay, atomic rollback and access
revocation. HTTP fixtures exercise the real configured transport boundary and
token consumption; they are never labelled controlled-inbox acceptance.

ADVERSARIAL: bind tokens to the exact current email and active account; keep old
tokens invalid even when an earlier asynchronous send completes after resend.
Reject absent/failed delivery and expire at the exact deadline. Use the configured
canonical origin rather than Host/forwarded headers. Do not enable trial grants.
First/final document checks: no additional corrections (0%, 0%). Implementation
may proceed. Controlled sender/inbox receipt remains an explicit operator input.

Implementation audit correction: public reset responses must also hide
transport latency. Next.js `after` schedules reset delivery after the generic
response; authenticated verification can report delivery failure directly. The
stored token remains `pending` and unusable if the process dies before sending;
a new request supersedes it. No raw token is persisted for an automatic replay.
HTTP acceptance holds the transport behind a latch and requires the recovery
response to finish before releasing it, then observes delivery state separately.

## Implementation receipt — 2026-10-31

`account_actions` schema and handle-injected ledger; opt-in Resend transport;
same-origin request/consume routes; verification status/action on `/account`;
`/recover` and fragment-driven `/account/action`; sign-in recovery link; updated
FAQ and operating guide. Delivery is disabled by default and no trial is enabled.

Nine new unit tests pass, including two independent processes competing for one
token, rollback of password/session/key changes, expiry/current-email/purpose/
delivery binding, hashing, resend order, replay and transport semantics.
Production HTTP verifies real route writers, canonical fragment links, a held
transport that cannot delay the generic reset response, known/unknown/failure
response equality, revocation and old/new password behavior. The trial gate
proves disabled delivery issues no action and renders an honest unavailable state.

`npm run verify` exit 0: 344 tests, quality PASS (319 files), production build,
642 main HTTP checks PASS, trial suite PASS and recovery drill PASS (7 concurrent
writes, 1998ms). Three formatting/import warnings in that run were corrected
directly; the post-correction `npm run lint` and `npm run typecheck` both exit 0
with no warnings, and the closure run on `871f19e` repeated `npm run verify`
exit 0. No external message or service provisioning occurred. Live acceptance is
`FID-2026-1030-045-LIVE`, linked to the implementation rather than fabricated.
