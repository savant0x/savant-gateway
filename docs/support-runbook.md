# Support and data-request runbook

Status: the authenticated support queue is implemented. Published customer
policy text (terms, privacy notice, refund position, acceptable use) is **not**
written or approved yet; see "Open operator decisions".

## What exists

- A signed-in customer submits a request from `/account` (kind, subject,
  message). The row is written to `support_requests` with the account id, time
  and status `open`.
- The operator reads the queue at `/admin/support`, or `GET /api/admin/support`
  (admin session required). It lists open requests first, with the customer name
  and email.
- Resolving (`PATCH /api/admin/support` with `{ id, note }`, or the button on
  the admin page) stores `resolved_at` and the note; the customer sees the same
  note on their request.
- There is no public form, no email address and no third-party ticket system.
  The support page says so, and the HTTP suite asserts that it does not invent a
  `mailto:` or `support@` address.

Limits: five new requests per account per hour. Subjects are 3–120 characters;
messages 10–4000; notes up to 1000. Messages are stored verbatim except NUL
bytes are stripped.

## Handling a request

1. Read the request in `/admin/support` and act with normal operator tools.
2. Record what was done in the resolution note. The note is customer-visible, so
   do not put internal credentials or another customer's data in it.
3. Mark it resolved. Resolving does not send a message; the customer sees the
   note the next time the account page renders.

## Data and account deletion

Deletion is manual and is not implemented as a self-service action. A
`data-deletion` request is a recorded request, not an executed deletion.

Procedure:

1. Verify the request comes from the account owner (the request is already
   account-bound; confirm any additional identity detail if the account is
   disputed).
2. Take a backup before any destructive step.
3. Delete the account row: `DELETE FROM users WHERE id = '<user id>';` with
   foreign keys enabled (the application sets `foreign_keys = ON`).

What that removes, by declared constraint:

| Data | Behavior |
| --- | --- |
| API keys, sessions, top-ups, subscriptions and invoice rows, credit holds, credit ledger, allocations, free-pool rows, trials, benchmark baselines, support requests | Deleted (`ON DELETE CASCADE`) |
| Usage events | **Retained** with `user_id` set to `NULL` (`ON DELETE SET NULL`), preserving settlement and financial history |
| Provider/account tables | Unchanged; they do not reference the customer |

4. Confirm the account no longer resolves (`users`, `api_keys`,
   `customer_sessions` return no rows) and that usage rows remain without an
   account link.
5. Record the resolution note without copying personal data into it.

Do not promise instant deletion or purge retained usage rows: they are kept
deliberately for billing and audit integrity. Any policy text must say this.

## Open operator decisions (FID-2026-1030-061)

These cannot be written by engineering without approval:

- Terms of service and acceptable-use positions.
- Privacy notice: jurisdiction, lawful basis, retention period for the retained
  usage rows, and the operator's identity/contact details.
- Refund, dispute, promotional-credit and credit-expiry positions. Current
  implementation has no credit expiry and no automated refund writer.
- A response-time commitment. The current page states none.

Until these are approved and published, `/support` is reachable and the queue
works, but there are no policy pages and the footer links no policy route. That
is why FID-056 cannot close yet.
