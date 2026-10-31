# Account email and recovery

Status: implemented, disabled unless explicitly configured. The regression gate
uses a local delivery fixture. No controlled inbox or production sender receipt
has been recorded, and the published v1.1 privacy notice does not list Resend.
The operator must approve the recipient disclosure before enabling real delivery.

## Configuration

Set these names in `.env.local` or the host's secret store:

- `EMAIL_TRANSPORT=resend`
- `EMAIL_FROM`: a sender verified in the operator's Resend account.
- `RESEND_API_KEY`: a server-only sending credential.
- `NEXT_PUBLIC_SITE_URL`: the canonical HTTPS origin used in email links.

An incomplete configuration disables the account verification action and tells
the customer recovery is unavailable. Neither a Host header nor a forwarded
origin can choose the link destination. Production sends only to the fixed
Resend `/emails` endpoint; `RESEND_API_URL` accepts a loopback HTTP fixture only
under the explicit disposable-runtime flag and is not a deployment setting.

Use the [Resend sending API](https://resend.com/docs/api-reference/emails/send-email)
and its [idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys)
when reviewing the integration. The adapter makes at most two attempts with
the same idempotency key, each under a five-second deadline, and refuses
redirects. Provider error bodies and token values are never logged.

## Customer paths

Signed-in accounts request or resend verification from `/account`. They must
open the newest email and press Verify email. A sent message or GET of the
action page never establishes ownership. Verification links expire in 24 hours.

`/recover`, linked from sign-in, requests a reset link expiring in 30 minutes.
Known, unknown and send-failed accounts receive the same generic response.
Delivery runs after that response through Next.js `after`, so transport latency
does not disclose account existence. A crash before sending leaves a pending,
unusable action; requesting a new link supersedes it. The service does not
persist a recoverable raw token for automatic restart replay.

Reset replaces the password and revokes every existing session and API key in
the same transaction. The customer must sign in again and create a new key.
It also invalidates outstanding verification/reset links. Trial activation and
subscription sales remain separate, disabled offering decisions.

Tokens appear in URL fragments, are removed from browser history on load, and
are consumed by a same-origin POST. The server stores only token hashes, their
purpose/current email binding, timestamps and delivery state. Account deletion
cascades these records. An address may request three actions per purpose/hour;
per-client bounds and durable account counts also apply.

## Delivery and incident checks

Inspect `account_actions.delivery_state` (`pending`, `sent`, `failed`) without
exporting token hashes or addresses. `sent` means the provider accepted the
message; it does not mean an inbox received it. A send failure never makes the
token usable. A later request invalidates an older link even if its delayed
delivery finishes afterward.

The live receipt must name the artifact, sender/domain and controlled inbox,
show received verification and recovery messages, consume both links, prove
replay refusal, and verify session/key revocation. Keep tokens and secrets out
of that receipt. Authorization to send a controlled message remains required.

Regression: `npm run verify` includes nine account-recovery unit cases, an
independent-process consumption race, actual HTTP request/consume delivery and
revocation checks, a held-delivery timing probe, and disabled-config checks.
