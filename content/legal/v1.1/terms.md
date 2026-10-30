## 1. What this service is

Savant Gateway is an independent API gateway. It forwards OpenAI-compatible Chat
Completions requests to upstream model providers under the operator's own
upstream account, and it meters the usage it settles. It is not affiliated with,
endorsed by, or sponsored by any upstream model provider.

The only inference endpoint in this release is `POST /v1/chat/completions`. A
native Anthropic Messages API and an OpenAI Responses API are not implemented,
even if a client library supports them.

Upstream providers apply their own terms to the content you send. Where those
terms are stricter than this document, they govern your use of that provider.

## 2. Accounts and keys

You need an account and an API key to call paid models. You must be at least 18
years old to hold an account.

You are responsible for keeping your key secret, for all activity under your
account, and for the accuracy of the email address you register. A key can be
revoked at any time from your account, and a revoked key is rejected
immediately.

One account is for one person or one organisation. You may create separate keys
for separate projects; you may not share an account or its keys among unrelated
parties.

## 3. Credit and billing

Paid usage is prepaid. Your balance is shown in US dollars. A request reserves
an estimate before it is dispatched and settles at the prices published in the
catalog at the time of the request.

A request that fails before any usage is delivered is not charged. Usage that
was delivered is charged at the published rate even if the response later ends
with an upstream error, or if you cancel it after content has arrived.

Free and trial allocations are not money. They have no cash value, are separate
from prepaid credit, are not transferable and are never refundable.

Subscriptions are not for sale in this release. There is no plan purchase path
in the service. Plans may be granted by the operator as complimentary access;
a comp is not a purchase and confers no cash value. Pricing for plans has not
been set, and no plan will be sold until these terms state the price, interval,
included allowance, overage behavior and renewal terms that apply.

Credit does not expire. The operator does not charge an inactivity fee and does
not impose a minimum balance. Introducing either would require a new version of
these terms announced before it applies.

Prices may change for future usage. A settled charge is never repriced
retroactively.

Payment is processed by Stripe. No tax is calculated or collected by this
service: no tax line is added at checkout, and the operator issues no separate
invoice or VAT document. The receipt Stripe provides is the record of payment.
Any tax that applies to your purchase is your responsibility.

## 4. Availability

The service is provided as available. There is no uptime guarantee, no service
level commitment and no credit for downtime.

Upstream capacity is shared and can be exhausted. When the gateway knows
capacity is unavailable it refuses a request rather than dispatching beyond
that capacity, so you may receive a capacity error where a direct provider call
would have queued. Maintenance, provider outages and provider quota resets can
interrupt service without notice.

There is no committed support response time.

## 5. Suspension and termination

The operator may suspend or terminate an account at any time, with or without
cause. Where practical, the reason is recorded on a support request in your
account.

If an account is closed without cause and a prepaid balance remains, the
balance can still be spent until the closure takes effect, or the operator may
refund the unused portion at its discretion. Reloading a closed account is not
possible.

If an account is closed for a breach of these terms or of the acceptable-use
policy, for fraud, for a chargeback, or to comply with a legal requirement, no
refund is owed beyond what the law requires.

You may stop using the service at any time, and you may request account deletion
from your account page. Deletion is performed by the operator after review, as
described in the privacy notice.

## 6. Liability

The service and all model output are provided as they are. The operator makes no
warranty that the service will be uninterrupted, error-free, or fit for a
particular purpose, and does not warrant any output produced by an upstream
model.

To the fullest extent permitted by law, the operator is not liable for indirect,
incidental, special, consequential or punitive damages, for lost profits,
revenue, data or goodwill, or for any loss arising from content you submitted,
output you received, or a decision you made using that output.

Where liability cannot be excluded by law, the operator's total liability for all
claims relating to the service is limited to the amount you paid for the service
in the three months before the event giving rise to the claim.

Nothing in these terms excludes or limits any right you have that cannot be
excluded or limited by law, including consumer rights under the law of
Kentucky or of your own place of residence where that law applies.

## 7. Changes

These terms are versioned. A published version is not edited in place: a change
is published as a new version with a new effective date, and the previous
version stays available so you can see what applied when you paid.

Material changes are surfaced in your account before they take effect.
Continuing to use the service after a new effective date accepts the new
version.

## 8. Who the operator is, and contact

The operator trades as Savant AI and operates from Kentucky, United States. It
is not currently registered as a separate legal entity, and it has no separate
registered office. A postal address is available on request from the contact
below, and will be printed here once one exists.

Questions about these terms, and any request relating to your account, are
submitted from your signed-in account on the support page. The operator reads
that queue and records the outcome on the request.

For matters that cannot be raised from an account, write to
spencerhowell84@gmail.com.
