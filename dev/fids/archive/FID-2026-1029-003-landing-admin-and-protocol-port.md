# FID: Public landing page, authenticated admin panel, and canonical protocol import

**Filename:** `FID-2026-1029-003-landing-admin-and-protocol-port.md`
**ID:** FID-2026-1029-003
**Severity:** high
**Status:** closed
**Created:** 2026-10-29 01:47 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

> Project application: this repository uses npm, not Bun, and it does not ship
> `fid:verify`. Gates are the ones declared in `protocol.config.yaml`; closure is
> checked by review against `templates/FID-TEMPLATE.md` plus the commit recorded
> here.

## Summary

The repository currently exposes the internal dashboard at `/`, has no public
product surface, and has no privileged management path: provider sync, key
minting, revocation, and usage reads are guarded only by a spoofable `Host`
header check. The governance documents are a condensed ECHO summary rather than
the canonical protocol files, and `AGENTS.md` names the harness protocol as
governing even though this is a single-agent repository. This FID plans a public
landing page at `/`, moves the existing console to `/dashboard`, adds a
password-protected `/admin` panel with real provider, model, key, and usage
management, and imports the canonical single-agent protocol configured for this
project.

## Environment

- **OS:** Windows 11 (Git Bash), local development host.
- **Language/Runtime:** Node `v24.21.0` in the session shell; package engine
  `>=22.18.0`; Next.js `16.4.3`; React `19.3.0`.
- **Tool Versions:** npm `12.2.1`, TypeScript `5.9.3`, HeroUI `3.2.7`,
  better-sqlite3 `13.0.3`.
- **Commit/State:** `1ce0173` on `main`; working tree contains the protocol
  import and the supplied `assets/` directory, both uncommitted at FID authoring
  time.

## Detailed Description

### Problem

1. `/` renders the operator dashboard (`app/page.tsx:1-9`), so there is no
   public landing page and no separation between marketing and privileged
   operations.
2. `lib/http.ts:37-52` treats a request as local when its `Host` header names
   localhost. Any client that can reach the server can send that header, so every
   `/api/*` mutation is effectively unauthenticated. `AGENTS.md` already records
   this as a development convenience, not a boundary.
3. There is no admin surface at all: no login, no session, no model
   enable/disable control, and no privileged view of keys or usage.
4. `ECHO.md` is a 101-line summary; `AGENTS.md` declares the harness protocol
   `v0.2.0` as governing, while the canonical single-agent adaptation is absent.
   The imported protocol's boot marker explicitly says the harness document is
   not single-agent governance.
5. The supplied logo and favicon set lives only in `assets/`; `public/` contains
   an unrelated `favicon.ico`, and metadata points at `/favicon.ico` only.

### Expected Behavior

- `/` is a public, server-rendered landing page with the supplied brand, live
  catalog counts, a free-model showcase, the request flow, and a code sample.
  It never reads API keys or usage rows.
- The existing operator dashboard remains available at `/dashboard` with its
  current behavior.
- `/admin` requires a password-derived session. Unauthenticated requests are
  redirected to `/admin/login`; unconfigured deployments show a setup card
  instead of pretending to accept a password.
- Admin sessions are HMAC-signed, HttpOnly, SameSite=Strict, time-limited
  cookies. Password comparison is timing-safe, login attempts are rate-limited,
  and state-changing admin requests reject cross-origin callers.
- Admin can sync the provider, enable or disable catalog models, create and
  revoke consumer keys, and see recent usage. Disabling a model removes it from
  the public catalog and from the gateway; a later provider sync must not
  silently re-enable it.
- The canonical ECHO documents, coding standards, and templates are present and
  configured for this repository; `AGENTS.md` names the single-agent protocol as
  governing.

### Root Cause

The scaffold was built for local verification only: the dashboard was placed at
the root because there was no public surface, and the local guard was written as
a convenience check rather than an authentication boundary. Protocol files were
condensed during the initial bootstrap instead of imported, and the harness
document was named as governance without the single-agent marker.

### Evidence

```text
$ pwd
/c/Users/spenc/dev/gateway
$ git rev-parse HEAD
1ce0173098a163817eec9c2031b94de733332900
$ wc -l ECHO.md AGENTS.md
  101 ECHO.md
  107 AGENTS.md
$ grep -n "isLocalRequest\|Host" lib/http.ts
35: function hostnameOf(host: string | null) {
44: export function isLocalRequest(request: Request) {
45:   const host = hostnameOf(request.headers.get("host"));
$ find app -maxdepth 2 -name 'page.tsx'
app/page.tsx
$ find public -type f
public/favicon.ico
```

`app/page.tsx` renders `Dashboard` directly; `app/api/*` handlers call
`localOnlyError(request)`; `app/layout.tsx` hard-codes the dashboard navbar and
footer for every route.

## Impact Assessment

### Affected Components

- `app/layout.tsx`, `app/page.tsx`, new `app/dashboard/*`, new `app/admin/*`.
- New `app/api/admin/session/route.ts` and `app/api/admin/models/route.ts`
  (collection PATCH; model ids contain `/`, so a path segment would not route).
- `app/api/keys/*`, `app/api/models/route.ts`, `app/api/provider/sync/route.ts`,
  `app/api/usage/route.ts` — guard changes only.
- `lib/store/models.ts`, `lib/store/overview.ts`, `lib/store/keys.ts` — admin
  listings and status persistence.
- New `lib/admin-session.ts`, `lib/admin-auth.ts`, `lib/admin-rate-limit.ts`,
  `lib/store/admin.ts`; `admin_state.session_epoch` in `lib/db.ts`.
- `components/landing/*`, `components/admin/*`, `components/provider-sync.tsx`.
- `components/navbar.tsx`, `config/site.ts`, `styles/globals.css`.
- `public/*`, `assets/*`, `app/layout.tsx` metadata, `public/site.webmanifest`.
- `ECHO.md`, `ECHO-single-agent.md`, `dev/echo-v0.1.2-single-agent.md`,
  `protocol.config.yaml`, `AGENTS.md`, `templates/*`, `docs/*`,
  `coding-standards/*`, `knowledge.md`, `README.md`.
- Tests: new `tests/admin-session.test.mjs`; existing `tests/http.test.mjs`.

### Risk Level

- [ ] Critical: crash, data loss or security vulnerability.
- [x] High: adding an authentication boundary to endpoints that currently rely
  on a spoofable header. A mistake either locks the operator out or leaves the
  panel open. Containment: pure session module with unit tests, explicit
  unconfigured state, and local checks that still work for `/dashboard`.

## Proposed Solution

### Approach

Reuse the existing store and dashboard sections; do not duplicate persistence or
formatting. Extract the provider-sync control so the console and admin share one
client component. Add a small, auditable session layer instead of a new auth
dependency: HMAC-SHA256 over an expiry plus nonce, password comparison on
SHA-256 digests with `timingSafeEqual`, and an in-memory failure limiter. The
signing key is derived from the session secret **and** the password, so rotating
the password invalidates every existing cookie. Admin pages are server-rendered,
send `Cache-Control: no-store`, and reject state-changing requests whose
`Origin` is present and does not match the request host.

Landing data comes from a dedicated read function returning provider status,
active model counts, and the free-model list. No keys, usage, or secrets cross
that boundary. The admin page loads its own snapshot server-side after the
session check.

The protocol import copies the canonical documents verbatim where they are
universal (`ECHO.md`, the single-agent protocol, the boot marker, coding
standards) and adapts only the project-specific contract (`protocol.config.yaml`,
`AGENTS.md`, templates, orientation page) so no document claims tooling this
repo does not have.

### Steps

1. Protocol port and configuration (P1). — implemented
2. Publish `assets/logo.png`, `assets/logo-32.png`, and the favicon set under
   `public/`; wire metadata, manifest, and `config/site.ts` (P2). — implemented
3. Add landing components and `getLandingData`; render public `/` (P3). —
   implemented
4. Move the console to `app/dashboard` with its own shell; strip the global
   dashboard navbar/footer from `app/layout.tsx` (P4). — implemented
5. Add `lib/admin-session.ts` with token creation/verification, config checks,
   and password verification; add unit tests (P5, P7). — implemented
6. Add `lib/admin-auth.ts`, rate limiter, session routes, login page, and logout
   control; revoke issued tokens on logout through a durable epoch (P5). —
   implemented
7. Add admin listings and `setModelStatus` with status-preserving sync; add
   `/api/admin/models` GET/PATCH; build `/admin` sections (P6). — implemented
8. Change existing `/api/*` guards to accept either a valid admin session or a
   loopback request, preserving the current console behavior (P5, P6). —
   implemented
9. Run gates, exercise landing/login/toggle/logout over HTTP, record evidence,
   update CHANGELOG and session summary, close and archive this FID (P7). —
   implemented

### Verification

- `tests/admin-session.test.mjs`: token round-trip, tampered signature, expired
  token, wrong password, short/missing configuration, and cookie attributes.
- `tests/http.test.mjs`: existing API-key extraction and loopback tests remain
  green.
- HTTP: `GET /` contains the live free-model count; `GET /admin` redirects to
  `/admin/login` without a cookie; wrong password `401`; correct password sets
  `HttpOnly; SameSite=Strict` and `GET /admin` returns `200`; `PATCH
  /api/admin/models` with `{ id, status }` toggles status; `DELETE
  /api/admin/session` clears the cookie and revokes the old token;
  unauthenticated admin API returns `401`; a foreign `Origin` on a mutation
  returns `403`; a cookie minted before a password change fails after it.
- Public landing HTML contains no key prefix, secret, or usage row.
- `npm run verify` and a production `npm run build`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/http.test.mjs
- gate: test tests/admin-session.test.mjs
- gate: quality
- gate: build
- gate: verify

## Perfection Loop

### Loop 1 — RED

- **RED:** Four observed gaps: dashboard occupies `/`; all `/api/*` mutations
  rely on a spoofable `Host` check; no admin authentication or management
  surface; canonical protocol absent while the harness document is named as
  governance. Assets exist only outside `public/`.
- **GREEN:** Plan above: public landing, `/dashboard` move, signed-cookie admin,
  admin-or-loopback guards, status-preserving model sync, protocol import with
  honest project configuration.
- **AUDIT:** Static review of every named file: `app/page.tsx` renders
  `Dashboard`; `lib/http.ts` exposes `localOnlyError`; `app/api/*` call it;
  `lib/store/models.ts` deletes and re-inserts all rows with `status = 'active'`
  (`replaceModels`, lines 46-78), which would erase an admin disable; the
  protocol marker names `dev/echo-v0.1.2-single-agent.md`, which was absent.
- **ADVERSARIAL:** An attacker able to reach the server can spoof `Host`; a
  static cookie would never expire; an in-memory limiter resets on restart; a
  sync would re-enable disabled models; landing data could accidentally include
  usage. Mitigations: HMAC + expiry + nonce, explicit unconfigured state,
  status-preserving sync, and a landing data function limited to public fields.
- **CHANGE DELTA:** baseline (first authored pass).

### Missed Questions

1. **What happens when no admin credentials are configured?** The login route
   returns `503` and the page renders a setup card with the exact env names; it
   never accepts an empty password.
2. **Does the admin cookie protect the existing console?** No. `/dashboard`
   remains a local operator surface; admin-or-loopback guards keep it working.
   Deploying this scaffold publicly still requires replacing that surface.
3. **How are disabled models represented?** `models.status` (`active` |
   `disabled`). Public listings filter to active; `getModelForGateway` already
   rejects non-active rows (`lib/gateway.ts:228`).
4. **What limits login guessing?** Five failed attempts per client key per ten
   minutes, `429` with `Retry-After`; a successful login clears the window.
5. **Where does the admin page get its data?** Server-side after the session
   check, using the existing store; mutations go through admin routes with the
   same check plus an origin check.
6. **Are the protocol copies honest?** Universal documents are copied verbatim;
   the project contract and templates state that `fid:verify` and Bun tooling do
   not exist here.
7. **What invalidates a session?** Password rotation (derived key), expiry, or a
   new secret. Logout clears the cookie; the stateless token itself expires.
8. **Do admin responses get cached?** No: `force-dynamic` plus `no-store` on
   pages and admin APIs.
9. **Do disabled models survive a sync?** Yes: `replaceModels` captures disabled
   ids before deleting and re-inserts them as disabled.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `508d4431524b26606e4b94a7b95e0b3ccc22a2c3`
  (`feat(gateway): add landing, admin panel, and canonical protocol`). The
  closure commit follows and only edits records plus moves this file.
- [x] **File:line ranges:** `lib/admin-session.ts:23-161` (config, token,
  password, cookie, origin); `lib/admin-auth.ts:20-100` (guards and cookies);
  `lib/admin-rate-limit.ts:10-60`; `lib/store/admin.ts:7-22`;
  `lib/db.ts:86-120` (`admin_state`); `lib/store/models.ts:21-110`
  (`listAllModels`, `setModelStatus`, status-preserving `replaceModels`);
  `app/api/admin/session/route.ts:1-90`; `app/api/admin/models/route.ts:1-50`;
  `app/api/keys/route.ts:8,16`, `app/api/models/route.ts:8`,
  `app/api/usage/route.ts:8`, `app/api/provider/sync/route.ts:8`
  (`guardLocalOrAdmin`); `app/page.tsx:1-8`; `app/dashboard/page.tsx:1-34`;
  `app/admin/page.tsx:14-18`; `app/admin/login/page.tsx:16-27`;
  `components/landing/*`; `components/admin/*`; `components/provider-sync.tsx`.
- [x] **Gate output:** `lint: exit 0 (0 warnings)`; `typecheck: exit 0`;
  `test: exit 0 (16 tests)`; `quality: PASS (400-line ceiling, 68 files)`;
  `build: exit 0 (landing, dashboard, admin, admin APIs)`. Full run below.
- [x] **Reproducibility:** `grep -n guardLocalOrAdmin app/api -R`;
  `grep -n "admin_state" lib/db.ts`;
  `node --test "tests/*.test.mjs"`; `npm run verify`.
- [x] **Step statuses:** 1-9 implemented.

### Code Verification Evidence

- [x] Affected paths exist.
- [x] Code matches the final solution, including the corrections below.
- [x] Declared gates pass with output; missing gates are stated honestly.
- [x] New/repaired production wiring has actual caller matches.
- [x] FID status reflects code and verification rather than the original plan.

### Implementation Audit — Corrections Found After Convergence

- **Collection PATCH.** Model ids contain `/` (`free/gpt-6-luna`), so a dynamic
  path segment is unreliable. `app/api/admin/models/route.ts` accepts
  `{ id, status }` instead; the FID's affected-component list was corrected.
- **Logout revocation.** The first live receipt showed the cleared cookie's
  token still returned `200` after logout. A durable `session_epoch` was added:
  tokens carry the epoch and `DELETE /api/admin/session` bumps it, so the old
  token returns `307` to `/admin/login`. The Loop 2 note that accepted a
  stateless logout window is superseded by this implementation.
- **Cookie check.** The first live check searched for `SameSite=Strict`
  case-sensitively; the header is `SameSite=strict`. Attributes are correct:
  `Path=/`, `Max-Age=28800`, `Secure` (production), `HttpOnly`,
  `SameSite=strict`.

### Loop 2 — Independent audit and self-correction

- **RED:** The plan signed with the secret alone (rotation left sessions valid),
  named no CSRF check, and counted disabled models.
- **GREEN:** Derive the key from secret plus password; require a same-host
  `Origin` when present; count only active models; preserve disabled ids across
  `replaceModels`.
- **AUDIT:** `lib/store/models.ts:46-78` shows the delete/re-insert;
  `lib/store/overview.ts:10-40` counts every row; `lib/http.ts:44-52` confirms
  the current guard.
- **ADVERSARIAL:** A logged-out token stays valid for the eight-hour window;
  the cookie is cleared. Restarts clear the limiter.
- **CHANGE DELTA:** 9.88% (`wc -m`, against 13,196).

### Loop 3 — Final convergence

- **RED:** No new actionable plan defects; the loopback limit and the
  logout window are documented.
- **GREEN:** None.
- **AUDIT:** Re-read the steps against `app/` and `lib/`; every named path
  exists and every route has a producing file.
- **ADVERSARIAL:** A public deploy that keeps `/dashboard` still trusts `Host`;
  stated, not hidden.
- **CHANGE DELTA:** 1.86% (`wc -m`) — this record only; converged.

## Resolution

- **Closed Date:** 2026-10-29 02:05 EDT.
- **Fix Description:** Public landing at `/`; console moved to `/dashboard`;
  password-protected `/admin` with provider sync, model enable/disable, key
  creation/revocation, and usage; admin sessions signed, expiring, revocable,
  rate-limited, and origin-checked; loopback-or-admin guards on existing APIs;
  canonical ECHO documents and npm-configured protocol contract imported;
  brand logo, favicons, and manifest wired.
- **Tests Added:** `tests/admin-session.test.mjs` (8 cases) and
  `tests/admin-rate-limit.test.mjs` (2 cases); existing `tests/http.test.mjs`
  remains green. `npm test` = 16 pass.
- **Verification Evidence:** `npm run lint` exit 0 with 0 warnings;
  `npm run typecheck` exit 0; `npm test` 16/16; `npm run quality` PASS
  (400-line ceiling, 68 files); `npm run build` exit 0. Live on the production
  build at `localhost:3100`: landing 200 with 45 models / 11 free; `/admin`
  307 to `/admin/login` without a cookie; wrong password 401; correct password
  200 with `HttpOnly`, `SameSite=strict`, `Max-Age=28800`; admin page 200 with
  panel markers; admin API 401 without a cookie; foreign-origin PATCH 403;
  disable 200 reduced the public catalog 45 → 44; provider sync 200
  (imported 45, free 11) preserved `disabled`; re-enable restored 45; key
  create 201 and revoke 200 with the admin cookie; logout 200 made the old
  cookie redirect 307 to `/admin/login`; six bad logins returned
  `401,401,401,401,401,429`; a fresh login after revocation returned 200.
- **Archived:** 2026-10-29 02:05 EDT.

## Lessons Learned

- The live path, not the unit test, exposed the stateless-logout gap. A cookie
  being cleared is not the same claim as a token being revoked; the receipt must
  test the old credential, not the browser's next request.
- Model ids are path-unsafe. Mutations that address a catalog row should carry
  the id in the body.
- Protocol imports need an honest project application: copying a harness
  document that names tooling this repository does not have would make every
  later claim false.
