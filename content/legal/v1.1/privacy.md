## 1. Who controls your data

Savant AI, Kentucky, United States, operates the gateway and decides how the
personal data described here is handled. It is not currently registered as a
separate legal entity and has no separate registered office; a postal address
is available on request. Contact is spencerhowell84@gmail.com, or the support
queue inside your account.

## 2. What is stored

- Your name, email address, account status and the times the account changed.
- A password hash, produced with scrypt. Your password itself is never stored.
- A hash of each session token, its expiry and whether it was revoked.
- The name, prefix, secret hash and last-used time of each API key. The full key
  is shown once when it is created; only its hash is kept.
- For each request: the model, token counts, the amount charged, latency,
  redacted error text and timestamps.
- Top-up amounts, currency, status and the identifiers Stripe returns.
- The plan snapshot, allowance periods and subscription state of any
  complimentary plan.
- Trial counters and daily free-allocation counters.
- Every credit balance change, with its reference and note.
- Support and data requests: kind, subject, message, status and the operator's
  resolution note.
- The Stripe customer identifier that links your account to the payment
  provider.

Request bodies and model output are not stored as content. A usage row records
counts and metadata, not your prompt and not the completion.

The operator can configure context text that is prepended to a request before
it is forwarded. That text is operator configuration, not customer data.

## 3. Who receives it

- **Upstream model providers** receive the request content you send — messages,
  tools and any images — together with the operator's upstream credential. They
  do not receive your password, your session or a key hash.
- **Stripe** receives your email address, the amount and the payment details you
  enter on Stripe's hosted page. Card details never reach this application.
- **Artificial Analysis** supplies public benchmark data used for catalog
  display. No customer data is sent to it.
- **OpenRouter** supplies a public price list. No customer data is sent to it.

Those recipients process data under their own terms and privacy notices. The
operator does not publish a separate sub-processor register; if a legal
requirement to disclose one arises, it will be added to this notice as a new
version.

## 4. Where data is processed

The application and its database run on infrastructure the operator controls,
and requests are forwarded to upstream providers in the United States. If you
access the service from outside the United States, your request content is
transferred to the United States for processing, and to whichever provider
serves the model you chose.

## 5. Cookies

- `sg_session` holds your signed-in session. It is HttpOnly, SameSite=Lax,
  Secure in production, lasts seven days and is cleared when you sign out.
- `sg_admin` holds the operator's admin session. It is HttpOnly,
  SameSite=Strict, Secure in production, and short lived. Customers never
  receive it.

No advertising, analytics or third-party tracking cookies are set.

## 6. Retention

- Account data, keys, sessions, payment records, credit ledger entries,
  plan records and support requests are kept while your account exists.
- Deleting an account removes the account and every account-owned row. Usage
  events are retained with the account reference removed, because they are the
  settlement and financial record; they no longer identify you.
- Server and hosting logs, where the host keeps them, are retained for up to 30
  days.
- Database backups are retained for up to 30 days. A deletion is not immediately
  propagated into backups that already contain the account, so a deleted record
  can persist in a backup until that backup ages out and is discarded.

## 7. Your requests and your rights

Requests are submitted from your signed-in account and recorded in the
operator's support queue. Account and data deletion is performed by the operator
after review; submitting a request does not by itself delete data, and the
outcome is recorded on the request.

You can ask for:

- a copy of the personal data held about your account;
- correction of data that is wrong;
- a machine-readable export of your account data;
- deletion of your account and its data;
- an explanation of how a request was processed.

To protect your data, a request is accepted only when it is submitted from your
signed-in account, or when it comes from the email address registered to the
account and is confirmed by a reply to that address. The operator aims to
respond within 30 days of confirming the request, and will tell you if more time
is needed.

You may complain to a data-protection or consumer-protection authority about the
handling of your data, including the Attorney General of Kentucky, or the
authority where you live.

## 8. Security

Passwords are stored as scrypt hashes. Session tokens and API keys are stored as
hashes, and a key is displayed once. Responses deny framing and content sniffing
and set a referrer policy; cross-origin mutations are refused, and credentials
are redacted from stored error text. No content-security-policy header is sent.

No system is perfectly secure. Report a suspected compromise through the support
queue, or open an issue at
https://github.com/savant0x/savant-gateway/issues for a vulnerability that does
not involve your account data.

## 9. Children

The service is for people aged 18 and over. No age verification is performed at
signup. If the operator learns that an account belongs to someone under 18, the
account is suspended and its data is deleted after the operator confirms the
position with the account holder.

## 10. Changes

This notice is versioned. A published version is not edited in place: a change
is published as a new version with a new effective date, and earlier versions
stay available.
