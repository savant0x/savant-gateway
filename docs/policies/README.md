# Customer policy drafts

**Status: drafts for operator review. Nothing here is published or effective.**

These documents are written from the behavior that is actually implemented in
this repository. They are not legal advice, and they are not in force. No route
serves them, the footer does not link them, and no customer has agreed to them.

## Files

| Draft | Covers |
| --- | --- |
| `v1/terms.md` | The service, accounts, keys, availability, suspension and termination |
| `v1/privacy.md` | What is stored, why, who receives it, retention, cookies and requests |
| `v1/refunds.md` | Prepaid credit, failed calls, refunds, disputes and expiry |
| `v1/acceptable-use.md` | Prohibited uses and enforcement |

## Before publishing

1. Replace every `[…]` placeholder: legal entity, jurisdiction, contact
   identity, retention period and the liability position.
2. Confirm each statement against the implementation at the commit you publish.
   The risky ones are called out in `docs/support-runbook.md`.
3. Decide the positions marked `OPERATOR DECISION REQUIRED`. They are proposals,
   not commitments.
4. Give each document a version and effective date, publish it at a stable route,
   link it from the footer and the account page, and record the published commit
   in the FID.

## Versioning rule

Published text is immutable. A change means a new version directory with a new
effective date; old versions stay reachable so a customer can see what applied
when their purchase happened. Do not edit a published version in place.

## Known mismatches to resolve before publishing

- No payment refund writer exists. Only credit-ledger adjustments do, and a
  refund cannot exceed the current credit balance.
- Account deletion is a manual operator action, not self-service.
- Usage events are retained with `user_id` nulled after account deletion;
  everything else account-owned is removed by cascade.
- No outbound support email exists; the queue is read by the operator in the
  admin panel.
