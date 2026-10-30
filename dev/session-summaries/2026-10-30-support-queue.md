# Session summary — authenticated support queue (FID-2026-1030-061)

**Date:** 2026-10-30
**FID:** FID-2026-1030-061
**Status:** implemented; open pending operator-approved policy text
**Request:** Implement 061 so 056 can close.

## What the FID requires and what could be built

061 requires a working support/contact path and published terms, privacy,
acceptable use, refund/dispute and expiry positions. The FID names the policy
positions, jurisdiction and contact identity as operator inputs; the repository
records no operator policy ("No operator policy recorded" in
`docs/offering-evidence.md`). Publishing drafted legal text or inventing a
contact address would violate the FID.

Built without that input:

- `support_requests` table (kind, subject, message, open/resolved, timestamps,
  resolution note), account-owned.
- Customer route `GET/POST /api/account/support`: same-origin, authenticated,
  validated, five per hour per account.
- Account UI card with the form and the customer's own history, including notes.
- Operator queue `GET/PATCH /api/admin/support` and `/admin/support`, with a
  resolve action and customer-visible note.
- Public `/support` page explaining the account-bound channel, plus a footer
  link; no address, SLA or third-party ticket system.
- `docs/support-runbook.md`: queue handling and the verified deletion behavior.

## Verification (actually run)

```text
npm run verify: exit 0
  lint: zero warnings          typecheck: exit 0
  tests 305 / pass 305         quality: PASS (400-line ceiling, 276 files)
  production build: clean      http-suite: 376 checks PASS
  trial-http-suite: all checks PASS
```

Support receipt: anonymous `401`; foreign origin `403`; invalid payload `400`
naming the field rule; recorded `201` with an id; the customer sees only their
own requests; the operator sees the request with the customer email and an open
count; resolving stores the note; the customer later sees `resolved` and the
note; `/support` renders with `lang`, skip link, one `h1`, no `mailto:` or
`support@`, and the footer links to it.

Deletion facts checked in source: every account-owned table uses
`ON DELETE CASCADE` except `usage_events.user_id`, which is `ON DELETE SET
NULL`. Deletion is therefore manual and retains settlement history deliberately.

## Open

- Approved terms, privacy notice (including the retained usage rows and a
  retention period), acceptable use, refund/dispute and credit-expiry positions,
  plus jurisdiction and contact identity.
- An outbound email/messaging channel. The queue is durable and operator-visible,
  but a resolution note is not a delivery guarantee.
- Self-service deletion and a live outside-channel inquiry.
