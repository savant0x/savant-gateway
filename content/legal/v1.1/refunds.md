## 1. How credit and charges work

- Prepaid credit is bought through Stripe Checkout and is added only after the
  signed payment webhook confirms the payment. Returning from checkout to this
  site never adds credit by itself.
- Paid usage debits your credit balance when the request settles, and writes a
  ledger entry you can see in your account.
- The operator can append a refund or adjustment entry to the ledger. A refund
  is bounded by the credit the account currently holds and can never create
  credit; an adjustment can raise or lower a balance but cannot push it below
  zero.
- Card refunds are not automated. There is no refund call to Stripe in this
  application, so a money refund is made by the operator in the Stripe
  dashboard. Refunds appear on your card on Stripe's and your bank's timing, not
  immediately.
- Subscriptions are not sold in this release. Complimentary plans have no cash
  value and are not refundable.

## 2. Failed and partial requests

- A request that fails before any usage is delivered is not charged.
- Usage that was delivered is charged at the published rate, including when a
  streaming response ends with an upstream error, and including when you cancel
  after content has arrived. A partial stream is not reversed automatically.
- If the operator determines a charge was wrong, it is corrected with a ledger
  entry that carries a reference and remains visible in your account.

## 3. When a charge is refunded

Prepaid credit is not refundable as a matter of course. There is no voluntary
cooling-off period, no refund window and no refund fee. A charge is refunded only
in these cases:

- **Duplicate or erroneous charge.** A charge caused by a duplicate payment or a
  gateway or payment error is refunded in full, to the original payment method,
  once verified.
- **Unauthorized charge.** A payment you did not authorize is refunded under the
  card network's rules, after verification.
- **Required by law.** A charge is refunded when a refund is required by the law
  that applies to you, including non-waivable consumer rights in Kentucky or in
  your own place of residence.
- **Operator discretion.** The operator may refund or credit an amount it
  considers appropriate, for example after a service failure it caused. This is
  discretionary and does not create an obligation in any other case.

Consumed credit is not refundable. Unused credit is not refundable when you
choose to close your account, except where the law requires it or the operator
decides otherwise; a closure without cause is described in the terms.

Requests may be submitted at any time. Card networks and applicable law set
their own deadlines, and a request submitted after those deadlines may no longer
be recoverable through the payment network.

## 4. Disputes and chargebacks

If a payment is disputed with the card issuer, the operator may freeze the
disputed credit and suspend paid usage until the dispute resolves. Usage
delivered before the freeze remains charged.

For a disputed period the operator will provide the payment record and the
metered usage rows that support the charge.

## 5. Expiry and promotional credit

- Prepaid credit has no expiry, no inactivity fee and no minimum balance.
- Complimentary and promotional credit has no cash value, is not transferable, is
  not refundable, and can be withdrawn if it was granted in error or is being
  abused. It does not convert into purchased credit when an account closes.
- Trial and daily free allocations are not credit, do not convert into credit,
  and are never refunded.

## 6. Evidence and response

A refund decision is recorded on your support request. If a ledger entry results,
your account shows the entry, its reference and the balance after it.

To review a payment, the operator needs your account email, the payment or
receipt reference, and — for a usage dispute — the model identifier and the time
of the request. Do not send card numbers or another person's data.

No response-time commitment is made. Billing questions are handled in the same
queue as other support requests.
