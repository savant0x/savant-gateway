# Refunds, credit and disputes — draft v1

**DRAFT — not published, not effective, no legal effect.**
Every position marked `OPERATOR DECISION REQUIRED` is a proposal. Replace it with
the operator's decision before publishing.

**Operator:** [LEGAL ENTITY]
**Contact:** [CONTACT EMAIL OR SUPPORT CHANNEL]
**Effective date:** [DATE] · **Version:** 1.0

## 1. What the system can actually do

- Prepaid credit is bought through Stripe Checkout and credited only after the
  signed payment webhook confirms it. A checkout return page never adds credit.
- Paid usage debits credit at settlement and writes a ledger row.
- The operator can append a `refund` or `adjustment` ledger entry. A refund is
  bounded by the credit the account currently holds and can never create credit;
  an adjustment can raise or lower a balance but cannot push it below zero.
- **There is no automated card refund and no Stripe Refund API call in this
  application.** Any money refund is a manual action in the Stripe dashboard by
  the operator.
- Subscriptions are not sold in this release. Comps have no cash value.

## 2. Failed and partial requests

- A request that fails before any usage is delivered is not charged.
- Usage that was delivered is charged at the published rate, including when a
  streaming response ends with an upstream error or the client cancels after
  content arrived. A charge is not reversed automatically for a partial stream.
- If the operator determines a charge is wrong, it is corrected with a ledger
  adjustment or refund entry, referenced and auditable.

## 3. Refund requests

Submit a `refund` request from the account page. The operator reviews the
account, the ledger and the payment record before deciding.

Proposed positions, each requiring an explicit decision:

- **Unused prepaid credit:** `[OPERATOR DECISION REQUIRED — e.g. refundable
  within 14 days of purchase, less payment-processor fees?]`
- **Consumed credit:** not refundable. `[CONFIRM]`
- **Duplicate or incorrect charge:** refunded or credited in full when verified.
  `[CONFIRM]`
- **Service failure:** `[OPERATOR DECISION REQUIRED — credit rather than cash
  refund? Any cap?]`
- **Fraud or chargeback:** account suspended pending review; credit frozen.
  `[CONFIRM]`

Statutory consumer rights in [JURISDICTION] override this policy where they
apply. `[OPERATOR DECISION REQUIRED: identify the applicable rights.]`

## 4. Disputes and chargebacks

If a payment is disputed with the card issuer, the operator may freeze the
disputed credit and suspend paid usage until the dispute resolves. Usage
delivered before the freeze remains charged. The operator will provide the
payment record and the metered usage for the disputed period.

## 5. Expiry and promotional credit

- Prepaid credit has no expiry in the current implementation.
- `[OPERATOR DECISION REQUIRED: introduce expiry? If so, the notice period and
  the order in which purchased and promotional credit is spent.]`
- Promotional or operator-granted credit: `[OPERATOR DECISION REQUIRED — expiry,
  withdrawal on abuse, non-transferability.]`
- Trial and daily free allocations are not credit, do not convert to credit, and
  are never refunded.

## 6. Response and evidence

A refund decision is recorded on the support request. The account ledger shows
the resulting entry, its reference and the balance after it. No response-time
commitment is made in this draft.
