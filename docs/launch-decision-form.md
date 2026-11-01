# Launch decision form

**Status:** all questions answered 2026-11-01. The operator accepted the
fast path and delegated the remaining choices to the most conservative
platform-aligned option. External acceptance evidence is still open, so the
decision is **GO for the internal acceptance run, NO-GO for public launch**.

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

- [x] **A (recommended)** Keep the share on `allow_free` rows only. — accepted 2026-11-01
- [ ] **B** Allow the share on paid-group models too.
- [ ] Other: ____________________________________________________________

If B, state any per-model exclusion or lower daily cap:
__________________________________________________________________________

### 1.2 Operating reserve and low-balance threshold

Proposed against the $150 upstream funding: **hold $50 unspent, alert at $50,
hard stop paid admission at $25.**

- [x] **A (recommended)** Approve $50 reserve / $50 alert / $25 hard stop. — accepted 2026-11-01
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

- [x] **A (recommended)** Approve this text as the new policy version. — accepted 2026-11-01
- [ ] **B** Approve with edits: ______________________________________________
- [ ] **C** Do not approve; hold launch.

Effective date: upon publication of the new immutable version (v1.2), no earlier
than 2026-11-01.

### 1.4 Provider rate-card confirmation

The resell programme grants permission, but does not by itself prove every
synced cost row matches the provider's current published rate card.

- [x] I confirm the synced cost column is the current provider rate card as of
      2026-11-01. — accepted by operator instruction
- [x] I confirm the 2.5× (2500 bps) sell markup is applied to the published
      catalog. — verified in code: `DEFAULT_MARKUP_BPS = 2500` and the seeded
      setting is `pricing.markup_bps = 2500`
- [x] Exceptions or unconfirmed models: none recorded by the operator.

### 1.5 Payment path

- [x] **A (recommended)** NOWPayments-hosted crypto invoices only. Cards remain
      gated off (`CARD_TOPUPS_ENABLED=false`). — accepted 2026-11-01
- [ ] **B** NOWPayments plus the direct-USDC lane at launch.
- [ ] **C** Something else: ________________________________________________

### 1.6 NOWPayments readiness

The payment path is selected, but operational readiness is **not established**.
Do not treat the unchecked items as approval to collect money.

- [ ] Account created and verified.
- [ ] `NOWPAYMENTS_API_KEY` configured.
- [ ] `NOWPAYMENTS_IPN_SECRET` configured.
- [ ] Outcome wallet selected and able to receive the supported assets.
- [x] `is_fee_paid_by_user: true` accepted (customer pays the processor fee).
      — selected 2026-11-01
- [ ] One test invoice created end to end.
- [ ] One signed IPN delivery received and credited in a test database.
- [ ] One replayed IPN refused.

Test invoice: not created. Amount planned: $5.00 (the minimum top-up).
Readiness owner: operator. Target: first business day after credentials and
funding are observed.

### 1.7 Direct-USDC lane — FID-2026-1030-068

Answer only if section 1.5 selected B.

- Chain: ____________________  USDC contract: ____________________
- xpub generated on the hardware wallet: [ ] yes  [ ] no
- RPC endpoint selected: [ ] yes  [ ] no
- Screening ruling: [ ] accept the exposure  [ ] budget a screening service
- Confirmation depth: __________ blocks

### 1.8 Upstream funding

- Amount funded: $150.00  Date: not yet funded (target: before the acceptance
  run).
- [x] Low-balance alert policy approved at the section 1.2 value; it will be set
      on the provider account when funding lands.
- [x] Funding is treated as prepaid inventory, not monthly burn.
- [x] No paid inference is admitted before this funding is observed.

### 1.9 Plan and subscription sales

- [x] **A (recommended)** No plans on sale at launch; keep subscription
      checkout closed. — selected 2026-11-01. `PLAN_SALES_ENABLED` stays unset
      and no plan row is published.
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

- [x] **A (recommended)** Approved as the gate; rerun on PostgreSQL and a
      production-equivalent host before launch. — targets accepted 2026-11-01;
      measurement and production-equivalent host approval remain open.
- [ ] **B** Change targets:

| Measure | New target |
| --- | --- |
| p95 | __________ |
| p99 | __________ |
| Steady rps | __________ |
| Peak RSS | __________ |
| Other | __________ |

Production-equivalent host: not yet named.
Measurement date: not yet scheduled; must run before launch.

### 2.2 Launch traffic cap

- Maximum paid upstream spend per day at launch: **$25.00** (one quarter of the
  $100 working capital above the $50 reserve).
- Maximum concurrent customers: **8** (the steady-load concurrency).
- Launch cohort size: **25 customers**.
- Expansion condition: seven consecutive days with zero unresolved settlements,
  zero ledger difference, no open critical incident, p95 inside the target, and
  upstream spend below the daily cap. Expansion is an explicit operator action,
  not automatic.

### 2.3 Provider limits

The fixture fallback is 6,000 rpm and concurrency 8. Confirm the real account
limits, or leave blank if unknown and the fallback should govern.

- Real account rpm: **15 observed** on the current free plan (2026-10-29).
  Contract limit on a funded/reseller plan: **unknown**.
- Concurrency: **1** until the provider confirms a higher plan.
- [x] Use the observed 15 rpm / 1 concurrency as the hard launch ceiling.

**Consequence:** 15 rpm is 0.25 rps. The load envelope's 20 rps steady target
cannot be met on this account. The load target stays as a gateway-capability
target, but launch capacity is the provider limit; the 20 rps number must not be
published as available capacity until the provider confirms a higher plan.

### 2.4 Real acceptance run

- Who runs it: **operator, with the agent running the local commands**.
- Date: **the first business day after the NOWPayments credentials and the $150
  upstream funding are observed.** No calendar date before those inputs exist.
- Funded upstream account: [ ] ready  [x] not ready
- Test payment amount: **$5.00** (minimum top-up, smallest real settlement).
- Test customer account: **a dedicated operator-controlled account**, created for
  the run and not used by a real customer.
- [x] I authorize real provider spend for this run, capped at $150 (the approved
      upstream funding envelope), subject to the section 2.2 daily cap.

This is authorization for the internal acceptance run only; it is not approval
to admit public traffic.

### 2.5 Hosted restore and rollback

- Production PostgreSQL provider/plan: **Neon, Launch plan** (per
  `docs/hosting-decision.md`).
- Backup schedule: **provider point-in-time restore plus a nightly logical
  `npm run db:backup` copied off the host.** The exact Neon retention window must
  be confirmed in the project console and recorded here when the project exists.
- Restore rehearsal date: **before launch, after the Neon project exists.**
- Rollback owner: **operator**.
- [ ] I confirm a restore and a rollback have been rehearsed on the production
      equivalent, not only locally. — not yet; this is a launch blocker.

### 2.6 Alert destination

- [ ] Alert transport configured (webhook or email). — not yet.
- Destination type: **signed HTTPS webhook to a dedicated incident endpoint**
  (`OPERATIONS_ALERT_WEBHOOK_URL` / `_SECRET`). A personal mailbox is not the
  primary alert path.
- [ ] A test alert was delivered and received. — not yet.
- On-call owner: **operator**.
- Response target: **30 minutes during the launch window**, best effort; this is
  an internal target, not a customer SLA.

### 2.7 Support ownership

- Who monitors the support queue: **operator**.
- Hours: **09:00–21:00 America/New_York, seven days a week during launch week**.
- First-response target: **one business day**, matching the published policy's
  no-response-time-commitment position.
- Deletion/privacy request owner: **operator**.

---

## 3. Policy and customer-facing text — FID-2026-1030-062

- [ ] Terms of service approved for the launch version. — **not yet**: `v1.1`
      still says payment is processed by Stripe. `v1.2` must name NOWPayments
      before launch.
- [ ] Privacy policy approved for the launch version. — **not yet**: `v1.1`
      names Stripe as the recipient and does not describe the crypto invoice
      identifiers. `v1.2` must be corrected.
- [x] No-refund policy approved (section 1.3). — accepted 2026-11-01; new
      immutable version still to be published.
- [x] Support contact published and monitored. — `spencerhowell84@gmail.com` is
      in `lib/legal-meta.ts`; the support queue is operator-owned.
- [x] Retention and deletion policy approved. — `v1.1` positions: 30-day log and
      backup retention, 30-day data-request deadline, manual deletion with
      `user_id` nulled on usage rows.
- [x] Every public price and savings claim matches the approved offering. — the
      2.5× catalog recompute and the approved savings claims are the published
      basis.
- [x] Trial stays disabled (`TRIAL_ENABLED=false`). — default in `.env.example`;
      production configuration must be confirmed at deploy.
- [x] Subscription checkout stays closed unless section 1.9 selected B. —
      `PLAN_SALES_ENABLED` is unset and no plan is published.

Policy owner: **operator**  Approval date: **2026-11-01** (no-refund text);
`v1.2` terms/privacy approval remains open.

---

## 4. Release candidate

Filled by the implementing agent, confirmed by the operator.

| Field | Value |
| --- | --- |
| Commit SHA | `78e8e0b` (last verified code commit; re-pin to the decision commit before acceptance) |
| Schema version | Current additive PostgreSQL schema from `lib/storage/schema/`; applied at boot, no separate version constant |
| Production origin | Not configured; must be an HTTPS production origin |
| Database target | Neon Launch PostgreSQL |
| Node/runtime | Node >= 22.18.0 (local 24.21.0) |
| `npm run verify` receipt | 2026-11-01 exit 0: 749 tests (748 pass, 1 skipped), lint 0 warnings, typecheck 0, quality 465 files, build 0, HTTP 750 + trial, recovery 12/12 |
| Load receipt | Candidate SQLite-era only; PostgreSQL rerun not run |
| Offering evidence date | 2026-11-01 |

- [x] The candidate SHA and configuration above are the ones approved for the
      **acceptance run**; they are not approved for public traffic.

Any change to SHA, schema, offering, price or payment lane invalidates this
approval and requires a new acceptance run.

---

## 5. Residual risks the operator accepts

Tick only after reading the limitation:

- [x] **Load numbers:** current published load numbers are SQLite-era until the
      PostgreSQL rerun completes.
- [x] **Legacy fixtures:** sixteen SQLite unit suites remain test-only; they do
      not touch the request path.
- [x] **Hosted restore:** the local recovery drill is not a hosted restore.
- [x] **Crypto volatility:** customer invoices are fixed at creation; the
      operator bears settlement-asset movement between invoice and conversion.
- [x] **No chargeback path:** on-chain payments are final; the remedy is service
      credit.
- [x] **Provider ceiling:** the observed 15 rpm free-plan limit is 0.25 rps, so
      the 20 rps load target cannot be offered as launch capacity until the
      provider confirms a higher plan.
- [x] **Policy drift:** `v1.1` terms/privacy still name Stripe; `v1.2` must be
      published before a customer can pay through NOWPayments.
- [x] Other: no additional risk accepted outside these items.

---

## 6. Decision

- Operator name: operator instruction recorded in session (name not supplied).
- Date: 2026-11-01
- Release SHA: not pinned; the last verified commit is `45461a9` and the
  storage cutover flip is `723ac1f`.
- Launch cohort: not set.
- Spend cap: $150 for the acceptance run; no production traffic authorized.

- [x] **GO — internal acceptance only.** Run the real payment/webhook,
      funded-inference, restore/rollback, alert and observation journeys against
      the pinned candidate, within the $150 authorization and $25/day cap.
- [x] **NO-GO — public launch.** Do not admit public traffic. The real hosted
      payment/webhook, funded paid inference, hosted restore/rollback, delivered
      alert, 24h/7d observation, PostgreSQL load rerun, and `v1.2` policy
      publication do not exist yet. These are tracked in FID-2026-1030-062.

Signature / explicit approval: operator instruction recorded 2026-11-01; GO for
the internal acceptance run, NO-GO for public launch.

---

## What happens next

1. The four open FID records (043, 044, 062, 068) are updated with these dated
   answers.
2. The no-refund policy is published as a new immutable version.
3. The PostgreSQL load rerun and the real acceptance journey are scheduled
   against the pinned SHA.
4. `npm run verify` is rerun on that SHA, and the final go/no-go is recorded in
   FID-062 with the receipt bundle.
