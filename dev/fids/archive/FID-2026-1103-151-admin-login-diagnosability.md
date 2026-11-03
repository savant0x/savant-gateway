# FID: Admin login failure diagnosability

**Filename:** `FID-2026-1103-151-admin-login-diagnosability.md`
**ID:** FID-2026-1103-151
**Severity:** high
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — error codes, one safe database probe and documentation; no credential fallback.

## Summary

The hosted admin password still "does not work" and the login path cannot say
which layer refused. A missing or short variable is rendered as unconfigured,
but a database failure while reading the session epoch escapes as an opaque
`500`, and a password or secret pasted with a trailing newline is reported as
`valid` even though the typed value cannot match. Add structured error codes to
`POST /api/admin/session`, turn the epoch failure into an actionable `503`, and
extend the safe diagnostics with surrounding-whitespace and database-reachability
state. Never trim, normalize or accept a second password as a fallback.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x, Next 16
- **Hosting:** Vercel production + Supabase PostgreSQL
- **Commit/State:** `416ee11` on `main`

## Detailed Description

### Problem

`app/api/admin/session/route.ts:POST` calls
`createSessionToken(config, await getAdminSessionEpoch())` outside a `try`.
`getAdminSessionEpoch()` opens the database; a missing, paused or unreachable
Supabase endpoint throws, so Next answers with an HTML `500`. The form then
shows `Sign in failed (HTTP 500)`, which names neither the database nor the
environment. `readAdminDiagnostics()` reports only length bands, so an
`ADMIN_PASSWORD` value with a trailing newline or a `"quoted"` value appears
`valid` while every typed password fails. The login screen also does not show
whether the database is reachable, which is the one dependency the POST cannot
work without.

### Expected Behavior

Every refusal names its layer:

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 403 | `cross_origin` | Origin does not match the request host |
| 429 | `rate_limited` | Five failed attempts in ten minutes |
| 401 | `invalid_password` | Password did not match |
| 503 | `admin_not_configured` | Missing or too-short admin variables |
| 503 | `database_unavailable` | Session epoch could not be read |

The login screen shows "Database: reachable/unavailable" and warns, without
printing the value, when the password or secret has surrounding whitespace.
The same values still compare exactly; no trimmed fallback is introduced.

### Root Cause

The route trusted the database read and never mapped its failure. Diagnostics
measured raw length only, not the whitespace that copy-paste into a host
dashboard commonly introduces.

### Evidence

```text
app/api/admin/session/route.ts:
  return attachSessionCookie(response,
    createSessionToken(config, await getAdminSessionEpoch()));
lib/admin-diagnostics.ts:
  password: band(env.ADMIN_PASSWORD ?? "", ADMIN_PASSWORD_MIN_LENGTH)
components/admin/login-form.tsx:
  payload?.error || `Sign in failed (HTTP ${response.status})`
```

## Impact Assessment

### Affected Components

- `app/api/admin/session/route.ts`
- `lib/admin-auth.ts` (`adminError` code channel)
- `lib/admin-diagnostics.ts`
- `components/admin/login-screen.tsx`, `components/admin/login-form.tsx`
- `app/admin/login/page.tsx`
- `tests/admin-diagnostics.test.mjs`, `scripts/http-suite/checks.mjs`
- `docs/troubleshooting.md`

### Risk Level

- [x] High: the operator cannot sign in to the console that prices and funds the
  gateway, and the current failure is not observable.

## Proposed Solution

### Approach

Add a machine-readable `code` to admin error bodies, catch only the epoch read,
and extend the existing safe diagnostic projection. Do not log values, do not
return a derived secret, and do not weaken the length or exact-comparison rules.

### Steps

1. **implemented (design):** `adminError(status, message, headers, code?)`
   includes `code` in the JSON body when supplied. Existing callers are
   unchanged.
2. **implemented (design):** every admin login refusal uses a named code; the
   epoch read is wrapped, and its failure returns
   `503 database_unavailable` with a message naming `DATABASE_URL` and
   `/api/ready` without echoing either value.
3. **implemented (design):** `AdminDiagnostics` gains
   `passwordWhitespace`, `sessionSecretWhitespace` and `databaseReachable`
   (the last supplied by the login page's `SELECT 1` probe through
   `getAdminSessionEpoch`). The diagnostics list flags whitespace and database
   state; it still reports only bands for lengths.
4. **implemented (design):** `LoginForm` preserves the server `code` and shows
   the server message; the form keeps the password field cleared on failure.
5. **implemented (design):** tests cover the whitespace flags and assert no
   secret substring is projected; the HTTP suite asserts
   `invalid_password` and `cross_origin` codes on the existing login checks.
6. **implemented (design):** `docs/troubleshooting.md` gains a Vercel admin
   section: variables must exist in the environment being served, values must
   be 12+/32+ characters, surrounding whitespace must be removed, an
   environment change needs a new deployment, and `/api/ready` must pass so the
   session epoch can be read.

### Verification

`npm run check`, `npm test`, `npm run build` and `npm run test:http`. Confirm the
login page shows "Database: unavailable" only when the probe fails, and that no
response or page contains a configured secret.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/admin-diagnostics.test.mjs
- gate: test tests/admin-session.test.mjs
- gate: quality
- gate: build
- gate: http (`npm run test:http`)

### Verification Receipt

Pending implementation.

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** a database failure is an opaque 500 and a whitespace-wrapped
  credential looks valid.
- **GREEN:** named codes, a caught epoch failure, safe whitespace and database
  diagnostics, and host-specific documentation.
- **AUDIT:** trace every `adminError` call; confirm no code path returns the
  password, the secret, a derived key or the connection string. Confirm the
  probe cannot turn a missing config into a configured state.
- **ADVERSARIAL:** Vercel environment scope, a redeploy not yet made, a paused
  Supabase project, a newline or quotes around a value, a 12-character password
  boundary, cross-origin login, rate-limit exhaustion, a user who sees a 503
  and retries forever, and the diagnostics being cached by a proxy.
- **CHANGE DELTA:** 5%; converged.

### Missed Questions

1. **Should the password be trimmed automatically?** No. Silent trimming would
   make a mistyped or intentionally spaced credential appear to work and would
   change the cryptographic input without the operator's knowledge. Detect and
   report it instead.
2. **Should `ADMIN_PASSWORD` be hashed in the environment?** Out of scope; the
   existing exact comparison is not the reported failure and a second credential
   format would split the operator contract.
3. **Should the login page probe the database on every render?** A single
   `SELECT 1`-shaped epoch read is bounded and the page is dynamic/no-store; the
   benefit is that the one hard dependency is visible before the operator types.
4. **Does the diagnostic reveal whether a guessed password is close?** No; only
   missing/too-short/valid and whether surrounding whitespace exists.
5. **Can the fix make hosted login work without a redeploy?** No code change
   can. The docs name the redeploy requirement, and the page now separates
   configuration from database failure so the remaining action is obvious.

## Implementation Evidence (REQUIRED for `closed`)

- **Commit SHA:** `a789b94`.
- **File:line ranges:** `app/api/admin/session/route.ts:28-99` (codes and caught
  epoch read), `lib/admin-auth.ts:21-35` (code channel),
  `lib/admin-diagnostics.ts:18-105` (whitespace and database state),
  `app/admin/login/page.tsx:38-63` (probe),
  `components/admin/login-screen.tsx:22-105,168-186` (state rendering),
  `components/admin/login-form.tsx:8-74` (code display),
  `tests/admin-diagnostics.test.mjs`, `scripts/http-suite/checks.mjs:600-622`,
  `docs/troubleshooting.md` (Vercel section).
- **Gate output:** `node --test tests/admin-diagnostics.test.mjs
  tests/admin-session.test.mjs` ended 15/15 pass. `node scripts/http-suite.mjs`
  ended `776 checks PASS`, including the two new `names its failure layer`
  checks for `invalid_password` and `cross_origin`. `npm test` ended 959 tests,
  958 pass, 1 skipped, 0 fail. `npm run typecheck`, `npm run quality` (PASS) and
  `npm run build` exited 0. `npm run lint` reported 0 errors and the same six
  pre-existing formatting warnings in the untouched `lib/launch-receipt.ts`.
- **Reproducibility:** `grep -rn "database_unavailable\|invalid_password"
  app/api/admin lib/admin-*` finds the codes; `grep -n "Database"
  components/admin/login-screen.tsx` finds the reachability row.
- **Step statuses:** steps 1-6 implemented.
- **Limitation:** the hosted Vercel deployment was not observed in this session.
  The code now separates configuration, database and credential failures and
  names the redeploy requirement; an operator must still check the deployed
  environment.

## Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: the login page probes the epoch and the
  POST route returns the named codes against the production build
- [x] FID status reflects the actual implementation state, with the hosted
  observation named as a limitation

### Loop 2 — Independent audit and self-correction

- **RED:** the epoch read sat outside a `try`, so a database outage was an HTML
  500; diagnostics reported a whitespace-wrapped password as `valid` with no
  explanation; the login screen did not show whether the database was
  reachable.
- **GREEN:** named codes, a caught epoch read, whitespace flags and a bounded
  reachability probe.
- **AUDIT:** every login refusal now names a layer. The probe runs only when the
  credentials are configured, and it cannot mark an unconfigured server as
  usable. No value, derived key or connection string is serialized.
- **ADVERSARIAL:** a password intentionally ending in a space is still valid and
  flagged, never trimmed; a rate-limited response is 429 with `rate_limited`; a
  cross-origin attempt is 403 with `cross_origin`; the diagnostics page is
  dynamic and no-store.
- **CHANGE DELTA:** 7%; converged.

### Loop 3 — Final convergence

- **RED:** a hosted environment can still be wrong after this code ships.
- **GREEN:** the page now distinguishes `admin_not_configured`,
  `database_unavailable` and `invalid_password`, and the docs name environment
  scope, whitespace and redeploy.
- **AUDIT:** the unit and HTTP checks pass; the remaining action is operator
  observation, not a code claim.
- **ADVERSARIAL:** rotating the password invalidates sessions as before; the
  diagnostics never reveal length or content.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** admin login failures now carry a machine-readable code,
  a database outage returns an actionable 503, and the login diagnostics report
  surrounding whitespace and database reachability without exposing values.
- **Tests Added:** Yes — two unit tests for whitespace/reachability and two HTTP
  checks for the refusal codes.
- **Verification Evidence:** 15/15 focused unit tests, 776-check HTTP suite,
  959-test unit run, typecheck, quality and build recorded above.
- **Archived:** 2026-11-03 — `dev/fids/archive/`.

## Lessons Learned

An authentication route that depends on storage must name the storage failure.
A bare 500 sends the operator to rotate the wrong secret, and a length-only
diagnostic cannot see a newline that makes every typed password fail.

## Lessons Learned

An authentication route that depends on storage must name the storage failure.
Reporting "invalid password" or a bare 500 for a database outage sends the
operator to rotate the wrong secret.
