# FID: Preserve admin session context

**Filename:** `FID-2026-1103-128-admin-session-continuity.md`
**ID:** FID-2026-1103-128
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Expired admin sessions redirect to login without preserving the safe destination
or explaining what happened. The login flow should return an operator to the
original admin path after re-authentication while rejecting external and
malformed return targets.

## Impact Assessment

- **Affected components:** `lib/admin-auth.ts`, admin route guards,
  `app/admin/login/page.tsx`, `components/admin/login-form.tsx`, session tests.
- **Risk:** medium operator-friction and possible redirect-validation risk.

## Proposed Solution

1. **implemented (design):** centralize safe same-origin `returnTo` validation.
2. **implemented (design):** preserve the path/query on unauthorized admin
   redirects and consume it once after successful login.
3. **implemented (design):** show an honest session-expired message without
   exposing auth state; test direct, malformed, external, and repeated targets.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** context is lost and return URLs can become an open-redirect hazard.
- **GREEN:** one shared validator, one-shot consumption, and route tests are
  required.
- **AUDIT:** inspect all admin guards and login callers for duplicated redirect
  logic; grep must find the shared helper in production callers.
- **ADVERSARIAL:** external URL, protocol-relative URL, encoded target,
  missing cookie, and expired session must remain safe.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should POST bodies be replayed?** No; only the safe GET destination is
   preserved.
2. **Should the message reveal which session failed?** No; use generic wording.

## Implementation Evidence

- **Commit SHA:** `4b57ebe`.
- **Implementation:** `lib/admin-return.ts` validates a same-origin, non-looping
  local path; `proxy.ts` preserves it on an expired admin session and the login
  screens consume it once after authentication. POST bodies are not replayed.
- **Tests Added:** Yes — `tests/admin-return.test.mjs` covers direct, external,
  protocol-relative, encoded and repeated targets.
- **Gate output:** `npm run check`, `npm test` 956 (955 pass, 1 skipped, 0
  fail), `npm run quality`, `npm run build`, `npm run test:http` (751 checks)
  and `npm run test:recovery` pass at `35c1d35`.
- **Limitation:** the single skipped test is the mandatory PostgreSQL
  concurrency proof in FID-126, not this feature.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** safe post-login continuation replaces the context-free
  redirect.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-128-admin-session-continuity.md`.
