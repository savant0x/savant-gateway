# Terms of service — draft v1

**DRAFT — not published, not effective, no legal effect.**
Prepared from the implemented behavior of this repository for operator review.
Replace every `[…]` placeholder before publishing.

**Operator:** [LEGAL ENTITY AND REGISTERED ADDRESS]
**Contact:** [CONTACT EMAIL OR SUPPORT CHANNEL]
**Effective date:** [DATE] · **Version:** 1.0 · **Governing law:** [JURISDICTION]

## 1. What this service is

This is an independent API gateway. It forwards OpenAI-compatible Chat
Completions requests to upstream model providers under the operator's own
upstream account, and it meters the usage it settles. It is not affiliated with
any upstream provider.

The only request endpoint in this release is `POST /v1/chat/completions`. A
native Anthropic Messages API and a Responses API are **not** implemented, even
if a client library supports them.

## 2. Accounts

You need an account and an API key to call paid models. You are responsible for
keeping your key secret, for activity under your account, and for the accuracy
of the email address you register. Keys can be revoked at any time; a revoked
key is rejected immediately.

You must be old enough to enter a contract in [JURISDICTION] and must not use
the service where doing so would be unlawful.

## 3. Credit and billing

- Paid usage is prepaid. The balance is shown in US dollars; requests reserve an
  estimate before dispatch and settle at the prices published in the catalog.
- A request that fails before any usage is delivered is not charged. Usage that
  was delivered is charged at the published rate even if the response later
  ends with an error or you cancel it.
- Free and trial allocations are not money. They have no cash value, are
  separate from prepaid credit, and are not refundable.
- **Subscriptions are not for sale in this release.** Plans may be granted by
  the operator as comps; a comp is not a purchase. [OPERATOR DECISION REQUIRED
  if plans are ever sold: plan price, interval, included allowance, overage
  behavior and renewal terms.]
- Credit does not expire in the current implementation. Charging a fee for
  inactivity, an expiry date or a minimum balance is an OPERATOR DECISION
  REQUIRED and must be announced before it applies.
- Prices may change for future usage. A settled charge is never retroactively
  repriced.
- Taxes, invoicing and VAT handling: [OPERATOR DECISION REQUIRED / JURISDICTION].

## 4. Availability

The service is provided as available, without an uptime guarantee or service
level commitment. Upstream capacity is shared and can be exhausted; the gateway
refuses a request rather than dispatching beyond known capacity. Maintenance,
provider outages and quota resets can interrupt service.

[OPERATOR DECISION REQUIRED: any availability commitment, credit for downtime,
or support response target. None is implemented or promised today.]

## 5. Suspension and termination

The operator may suspend or terminate an account for a breach of these terms,
the acceptable-use policy, non-payment, fraud, or a legal requirement. Where a
paid balance remains and the termination is not for cause, the operator will
consider a refund under the refund draft. You may stop using the service at any
time and may request account deletion; deletion is a manual operator action and
is described in the privacy draft.

## 6. Liability

[OPERATOR DECISION REQUIRED: limitation of liability, exclusions, and the
consumer-rights carve-out for the chosen jurisdiction. No wording is proposed
here because it is a legal position, not an implementation detail.]

## 7. Changes

The operator may update these terms. A published version is immutable; a change
is a new version with a new effective date. Continued use after the effective
date accepts the new version. Material changes will be surfaced in the account
area before they apply.

## 8. Contact

Support and data requests are submitted from a signed-in account at `/account`
and are stored in the operator's support queue. [CONTACT EMAIL OR SUPPORT
CHANNEL — fill only with a channel the operator actually owns and monitors.]
