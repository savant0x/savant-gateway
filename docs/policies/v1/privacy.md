# Privacy notice — draft v1

**DRAFT — not published, not effective, no legal effect.**
Written from the data this implementation actually stores and sends for operator
review. Replace every `[…]` placeholder before publishing.

**Controller:** [LEGAL ENTITY AND REGISTERED ADDRESS]
**Contact:** [CONTACT EMAIL OR SUPPORT CHANNEL]
**Effective date:** [DATE] · **Version:** 1.0 · **Jurisdiction:** [JURISDICTION]

## 1. What is stored

| Data | Where | Why |
| --- | --- | --- |
| Name, email, status, timestamps | `users` | Account identity and service messages |
| Password hash (scrypt) | `users` | Sign-in; the password itself is never stored |
| Session token hash, expiry, revocation | `customer_sessions` | Signed-in access |
| Key name, prefix, secret hash, last-used time | `api_keys` | Authentication; the full key is shown once and only its hash is stored |
| Model, token counts, charge, latency, redacted error text, timestamps | `usage_events` | Metering, billing evidence and operator reconciliation |
| Top-up amount, currency, status, Stripe references | `topups`, `subscription_invoices` | Payment records |
| Plan snapshot and allowance periods | `subscriptions` | Entitlement accounting |
| Trial and daily-allocation counters | `trials`, `free_pool_usage`, `free_pool_allocations` | Free-tier limits |
| Credit balance changes and their notes | `credit_ledger` | Auditable balance history |
| Support subject, message, status and operator note | `support_requests` | Handling your request |
| Stripe customer id | `users`, `subscriptions` | Payment provider linkage |

Request bodies and model outputs are **not** stored as content. Usage rows keep
token counts and metadata, not your prompt or the completion.

Operator-authored context banners can append text to a request before it is
forwarded. Banners are configuration, not customer data.

## 2. Who receives data

- **Upstream model providers** receive the request content (prompt, messages,
  tools, images you include) and the operator's upstream credential. They do not
  receive your password, session, or key hash.
- **Stripe** receives payment details, your email and the amount. Card data is
  entered on Stripe's hosted page and never reaches this application.
- **Artificial Analysis** provides public benchmark data used for catalog
  display. No customer data is sent to it.
- **OpenRouter** provides a public price list. No customer data is sent to it.

These recipients process data under their own terms. [OPERATOR DECISION
REQUIRED: processor list review, data-processing agreements, and any
sub-processor disclosure obligations for [JURISDICTION].]

## 3. Cookies

- `sg_session`: the signed-in customer session. HttpOnly, SameSite=Lax, Secure
  in production, seven-day lifetime, cleared on sign-out.
- `sg_admin`: the operator admin session. HttpOnly, SameSite=Strict, Secure in
  production, short-lived.

No advertising or analytics cookies are set by this application.

## 4. Retention

- Account data, keys, sessions, payment records, ledger, subscriptions and
  support requests are kept while the account exists.
- Deleting an account removes the account row and every account-owned row by
  cascade. Usage events are **retained** with `user_id` set to null, because they
  are the settlement and financial record. They no longer identify the account.
- Server and hosting logs are kept for [RETENTION PERIOD — OPERATOR DECISION
  REQUIRED].
- Backups are kept for [RETENTION PERIOD — OPERATOR DECISION REQUIRED].

## 5. Your requests

Requests are submitted from a signed-in account and recorded in the operator's
support queue. Account and data deletion is performed manually by the operator
after review; submitting the request does not delete data by itself. The
operator records the outcome on the request, and your account shows it.

Depending on [JURISDICTION], you may have rights to access, correct, export or
delete personal data, or to object to processing. [OPERATOR DECISION REQUIRED:
the exact rights, verification steps and response deadline for the chosen
jurisdiction.]

## 6. Security

Passwords are stored as scrypt hashes; session tokens and API keys are stored as
hashes, and a key is shown once. Responses deny framing and content sniffing and
set a referrer policy; cross-origin mutations are refused, and credentials are
redacted from stored error text. There is no content-security-policy header. No
system is perfectly secure; report a suspected compromise through the support
queue.

## 7. Children

The service is not intended for anyone under the age required to consent to data
processing in [JURISDICTION]. [OPERATOR DECISION REQUIRED: minimum age and the
process for a suspected minor account.]

## 8. Changes

A published version is immutable. Changes are published as a new version with a
new effective date; the previous version stays available.
