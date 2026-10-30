# Security

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub's private vulnerability reporting for this repository:
<https://github.com/savant0x/savant-gateway/security/advisories/new>

Include the affected path, the request or input that triggers the issue, and the
observed impact. Do not include live provider keys, customer secrets or full
prompts in the report.

## Trust boundaries

The application is a single Node process with local SQLite. It has three
credential surfaces:

| Surface | Credential | Storage | Lifetime |
| --- | --- | --- | --- |
| Admin console | `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` | environment only | 8-hour signed cookie |
| Customer session | 32 random bytes, base64url | `customer_sessions.token_hash` (SHA-256) | 7 days, revocable |
| Gateway API key | `sk-` + 32 random bytes | `api_keys.secret_hash` (SHA-256) | until revoked |

No plaintext session token, API key or upstream provider key is stored in the
database, returned after creation, or sent to the browser.

- **Admin.** `/admin` pages call `requireAdminPage()`; `/api/admin/*` calls
  `guardAdminApi`, which requires a same-origin request and a valid signed
  session. Signing out bumps a session epoch, invalidating every admin token.
  Changing `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` invalidates existing
  tokens through the derived key.
- **Customer.** Sign-in sets an HttpOnly, SameSite=Lax cookie (Secure in
  production). Session resolution requires an unexpired, unrevoked token whose
  user is still active; logout revokes the row rather than merely clearing the
  browser cookie. Login attempts are limited per address and, independently,
  per account, so rotating `x-forwarded-for` does not reset the account ceiling.
  A missing account still runs the password hash (`dummyHash`) so response timing
  does not reveal whether an email exists.
- **API keys.** Authentication requires both an active key and an active user.
  Revocation is scoped by the authenticated user id, so one customer cannot
  revoke another's key. The list endpoint returns the display prefix only.

## Isolation

Every customer read and write derives the account from the session or key; no
route accepts a customer id from the request body. Key revocation, subscription
cancel/resume/portal, top-up and usage reads are scoped to that identity. The
HTTP suite exercises cross-account key listing and deletion, a revoked key, a
suspended account and session recovery after reactivation.

The legacy dashboard endpoints (`/api/keys`, `/api/models`, `/api/usage`,
`/api/provider/sync`) keep a loopback bypass for local development only. The
bypass is compiled out when `NODE_ENV=production`; in production those routes
require an admin session. The HTTP suite runs against a production build and
asserts the bypass returns 403.

Same-origin checks compare the `Origin` header with the request `Host`. Forwarded
headers (`x-forwarded-host`, `x-forwarded-proto`, `forwarded`) are not trusted for
authorization. An absent `Origin` is treated as same-origin for non-browser
clients; cookie-bearing browser mutations still require the request to reach the
same host, and session cookies are SameSite.

## Outbound provider boundary

Provider base URLs and default headers are operator-controlled records. A base
URL must be HTTP(S) and must not embed a username or password; the key is read
from the environment variable named by `keyEnvVar` and never stored in the
record. Provider requests carry a 20-second timeout by default and do not follow
redirects, so a misconfigured origin cannot forward the credential to another
host.

## Diagnostics and redaction

One policy (`lib/redaction.ts`) removes configured secret values and
token-shaped text (`sk-…`, `whsec_…`, bearer tokens, `password=`/`api_key=`
assignments) before text is written to the server log, a usage row, a provider
runtime row, a benchmark attempt or a Stripe webhook failure.

Provider error bodies are redacted at the boundary that first reads them, before
they can be persisted or returned. Public responses stay generic: a 5xx upstream
failure returns "Provider request failed", and local exception text is never sent
to a customer. Upstream 4xx messages that are safe to relay have already passed
through the same redaction. The usage row keeps the redacted diagnostic so an
operator can investigate without recovering a credential.

## Operational preconditions

These are properties of the code, not a claim that a deployment is secure:

- Run behind HTTPS. Production cookies are `Secure`; plain HTTP breaks sign-in
  rather than silently weakening it.
- If a reverse proxy sets forwarding headers, it must overwrite client-supplied
  values. Per-address rate limits are best-effort otherwise; the per-account
  login ceiling does not depend on them. Deployment and ingress verification is
  FID-2026-1030-057.
- Rate-limit state is per process. Do not run multiple replicas without shared
  storage for limits.
- The admin password is single-factor. Use a long, unique value and keep
  `ADMIN_SESSION_SECRET` out of source control.
- Rotate an upstream key by changing its environment variable and restarting;
  the provider record stores only the variable name. Rotate a customer key by
  revoking it and creating another.
