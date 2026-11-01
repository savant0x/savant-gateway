# Launch decision form

**Status:** awaiting operator answers. This is the only input needed to replace
the four open FID records with dated decisions.

Fill this in directly, then return the file or paste the completed sections. Tick
one box per question; write an alternative where the recommendation does not
match your intent. **Do not paste secrets here.** Set credentials in `.env.local`
and tick “configured”; the form records only whether the value exists.

Nothing below is approved until you sign section 6.

## Fast path — the eight answers that unblock the most

If the full form is too long for one pass, answer these first. Every other item
is a confirmation or a checklist.

| # | Decision | Section | Recommended |
| --- | --- | --- | --- |
| 1 | Free share stays on `allow_free` rows only | [1.1](#11-free-share-scope) | A |
| 2 | $50 reserve / $50 alert / $25 hard stop | [1.2](#12-operating-reserve-and-low-balance-threshold) | A |
| 3 | Approve the no-refund policy text | [1.3](#13-no-refund-policy) | A |
| 4 | Confirm the synced rate card and 2.5× markup | [1.4](#14-provider-rate-card-confirmation) | confirm |
| 5 | NOWPayments is the launch lane; cards off | [1.5](#15-payment-path) | A |
| 6 | Approve the load targets and name the PostgreSQL run date | [2.1](#21-load-envelope) | A |
| 7 | Authorize the capped real acceptance run | [2.4](#24-real-acceptance-run) | authorize |
| 8 | Final GO / NO-GO for the pinned SHA | [6](#6-decision) | explicit |

---

## 1. Offering and pricing — FID-2026-1030-044

### 1.1 Free-share scope

The daily free share is currently spendable only on the 11 `allow_free` rows.
The upstream marks paid rows `allowFree: true`, so allowing paid-group models is
a local admission change, not an upstream permission change.

- [ ] **A (recommended)** Keep the share on `allow_free` rows only.
- [ ] **B** Allow the share on paid-group models too.
- [ ] Other: ____________________________________________________________

If B, state any per-model exclusion or lower daily cap:
__________________________________________________________________________

### 1.2 Operating reserve and low-balance threshold

Proposed against the $150 upstream funding: **hold $50 unspent, alert at $50,
hard stop paid admission at $25.**

- [ ] **A (recommended)** Approve $50 reserve / $50 alert / $25 hard stop.
- [ ] **B** Use different values:

| Value | Dollars |
| --- | --- |
| Unspent reserve | $__________ |
| Low-balance alert | $__________ |
| Hard stop paid admission | $__________ |

### 1.3 No-refund policy

The published policy still describes a manual Stripe refund. Proposed replacement
text for a new immutable version:

> Payments are final. The gateway does not issue cash refunds. If a paid service
> failure is verified by the operator, the remedy is service credit applied to
> the same account, at the operator's discretion and in the amount of the
> affected charge.

- [ ] **A (recommended)** Approve this text as the new policy version.
- [ ] **B** Approve with edits: ______________________________________________
- [ ] **C** Do not approve; hold launch.

Effective date: ____________________

### 1.4 Provider rate-card confirmation

The resell programme grants permission, but does not by itself prove every
synced cost row matches the provider's current published rate card.

- [ ] I confirm the synced cost column is the current provider rate card as of
      ____________________ (date).
- [ ] I confirm the 2.5× (2500 bps) sell markup is applied to the published
      catalog.
- [ ] Exceptions or unconfirmed models:
      ____________________________________________________________________

### 1.5 Payment path

- [ ] **A (recommended)** NOWPayments-hosted crypto invoices only. Cards remain
      gated off (`CARD_TOPUPS_ENABLED=false`).
- [ ] **B** NOWPayments plus the direct-USDC lane at launch.
- [ ] **C** Something else: ________________________________________________

### 1.6 NOWPayments readiness

Tick only what is actually configured and tested. Values stay in `.env.local`.

- [ ] Account created and verified.
- [ ] `NOWPAYMENTS_API_KEY` configured.
- [ ] `NOWPAYMENTS_IPN_SECRET` configured.
- [ ] Outcome wallet selected and able to receive the supported assets.
- [ ] `is_fee_paid_by_user: true` accepted (customer pays the processor fee).
- [ ] One test invoice created end to end.
- [ ] One signed IPN delivery received and credited in a test database.
- [ ] One replayed IPN refused.

Test invoice date: ____________________  Amount: $__________

### 1.7 Direct-USDC lane — FID-2026-1030-068

Answer only if section 1.5 selected B.

- Chain: ____________________  USDC contract: ____________________
- xpub generated on the hardware wallet: [ ] yes  [ ] no
- RPC endpoint selected: [ ] yes  [ ] no
- Screening ruling: [ ] accept the exposure  [ ] budget a screening service
- Confirmation depth: __________ blocks

### 1.8 Upstream funding

- Amount funded: $__________  Date: ____________________
- [ ] Low-balance alert configured at the section 1.2 value.
- [ ] Funding is treated as prepaid inventory, not monthly burn.
- [ ] I understand no paid inference is admitted before this funding is observed.

### 1.9 Plan and subscription sales

- [ ] **A (recommended)** No plans on sale at launch; keep subscription
      checkout closed.
- [ ] **B** Sell plans at launch; attach the funded capacity and cost budget:
      ____________________________________________________________________

---

## 2. Capacity and acceptance — FID-2026-1030-060 / 062

### 2.1 Load envelope

The local envelope is `candidate`, measured on SQLite. It must be re-measured
against PostgreSQL before approval.

Current candidate targets:

| Measure | Candidate |
| --- | --- |
| p95 latency | 1,500 ms |
| p99 latency | 3,000 ms |
| Admitted success | ≥ 99.00% |
| Steady admitted throughput | ≥ 20 rps |
| Unexpected responses | 0 |
| Peak RSS | ≤ 512 MB |
| Database size | ≤ 256 MB |
| Unaccounted admitted calls | 0 |
| Ledger difference | 0 micros |
| Unresolved settlements after crash | 0 |
| Quarantined after crash | ≤ 4 |
| Total quarantined | ≤ 5 |

- [ ] **A (recommended)** Approved as the gate; rerun on PostgreSQL and a
      production-equivalent host before launch.
- [ ] **B** Change targets:

| Measure | New target |
| --- | --- |
| p95 | __________ |
| p99 | __________ |
| Steady rps | __________ |
| Peak RSS | __________ |
| Other | __________ |

Production-equivalent host: ______________________________________________
Measurement date: ____________________

### 2.2 Launch traffic cap

- Maximum paid upstream spend per day at launch: $__________
- Maximum concurrent customers: __________
- Launch cohort size: __________
- Expansion condition (when the cap may rise):
  __________________________________________________________________________

### 2.3 Provider limits

The fixture fallback is 6,000 rpm and concurrency 8. Confirm the real account
limits, or leave blank if unknown and the fallback should govern.

- Real account rpm: __________  Concurrency: __________
- [ ] Use 6,000 rpm / 8 concurrency until the real limits are observed.

### 2.4 Real acceptance run

- Who runs it: ____________________________________________________________
- Date: ____________________
- Funded upstream account: [ ] ready  [ ] not ready
- Test payment amount: $__________
- Test customer account: __________________________________________________
- [ ] I authorize real provider spend for this run, capped at $__________.

### 2.5 Hosted restore and rollback

- Production PostgreSQL provider/plan: ___________________________________
- Backup schedule: ________________________________________________________
- Restore rehearsal date: ____________________
- Rollback owner: ________________________________________________________
- [ ] I confirm a restore and a rollback have been rehearsed on the production
      equivalent, not only locally.

### 2.6 Alert destination

- [ ] Alert transport configured (webhook or email).
- Destination type: ____________________
- [ ] A test alert was delivered and received.
- On-call owner: __________________________________________________________
- Response target: __________ minutes

### 2.7 Support ownership

- Who monitors the support queue: _________________________________________
- Hours: __________________________
- First-response target: __________ hours
- Deletion/privacy request owner: _________________________________________

---

## 3. Policy and customer-facing text — FID-2026-1030-062

- [ ] Terms of service approved for the launch version.
- [ ] Privacy policy approved for the launch version.
- [ ] No-refund policy approved (section 1.3).
- [ ] Support contact published and monitored.
- [ ] Retention and deletion policy approved.
- [ ] Every public price and savings claim matches the approved offering.
- [ ] Trial stays disabled (`TRIAL_ENABLED=false`).
- [ ] Subscription checkout stays closed unless section 1.9 selected B.

Policy owner: __________________________  Approval date: ____________________

---

## 4. Release candidate

Filled by the implementing agent, confirmed by the operator.

| Field | Value |
| --- | --- |
| Commit SHA | |
| Schema version | |
| Production origin | |
| Database target | |
| Node/runtime | |
| `npm run verify` receipt | |
| Load receipt | |
| Offering evidence date | |

- [ ] The candidate SHA and configuration above are the ones approved.

Any change to SHA, schema, offering, price or payment lane invalidates this
approval and requires a new acceptance run.

---

## 5. Residual risks the operator accepts

Tick only after reading the limitation:

- [ ] **Load numbers:** current published load numbers are SQLite-era until the
      PostgreSQL rerun completes.
- [ ] **Legacy fixtures:** sixteen SQLite unit suites remain test-only; they do
      not touch the request path.
- [ ] **Hosted restore:** the local recovery drill is not a hosted restore.
- [ ] **Crypto volatility:** customer invoices are fixed at creation; the
      operator bears settlement-asset movement between invoice and conversion.
- [ ] **No chargeback path:** on-chain payments are final; the remedy is service
      credit.
- [ ] Other: ______________________________________________________________

---

## 6. Decision

- Operator name: __________________________________________________________
- Date: ____________________
- Release SHA: ____________________________________________________________
- Launch cohort: __________________________________________________________
- Spend cap: $____________________

- [ ] **GO** — approve the pinned release for the stated cohort and spend cap.
- [ ] **NO-GO** — do not release. Reasons:
      ____________________________________________________________________

Signature / explicit approval:
__________________________________________________________________________

---

## What happens next

1. The four open FID records (043, 044, 062, 068) are updated with these dated
   answers.
2. The no-refund policy is published as a new immutable version.
3. The PostgreSQL load rerun and the real acceptance journey are scheduled
   against the pinned SHA.
4. `npm run verify` is rerun on that SHA, and the final go/no-go is recorded in
   FID-062 with the receipt bundle.
