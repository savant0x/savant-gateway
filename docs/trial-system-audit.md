# Trial credit system — current state

Audited 2026-10-29 against the code on `main`. This records what exists, what
is inert, and how the trial relates to the daily shared allocation. It is not a
claim that trial access works for customers.

## What is implemented

- **One lifetime grant per customer.** `trial_grants` has `user_id` as its
  primary key, so a second key, a second login, or a later UTC day cannot mint
  another grant (`lib/schema/trials.ts:6`).
- **Durable reservations and one-time settlement.** `trial_reservations` rows
  survive expiry and accept exactly one settlement
  (`lib/trial-ledger.ts`, `settleTrial`).
- **Historical usage offset.** A new grant starts with `used_tokens` equal to
  the customer's recorded `free_pool_usage`, so conversion does not hand an
  existing customer a fresh allowance (`lib/trial-ledger.ts:88-99`).
- **Fail-closed issuance.** A grant requires a verified email, a positive
  `TRIAL_WEIGHTED_TOKENS`, and a gateway-wide `TRIAL_GATEWAY_GRANT_BUDGET`
  that the new grant must fit inside (`lib/trial-ledger.ts:60-76`).
- **Explicit paid transition.** Routing requires an explicit
  `TRIAL_MODEL_PAIRS` entry naming an active, in-catalog, priced paid model on
  the same provider; pairs are never inferred
  (`lib/gateway-trial.ts:16-45`).
- **Tests.** `tests/trials.test.mjs` (5 cases) covers default-off behavior,
  shared grants, replay-safe settlement, budget and verification gates, and
  late settlement.

## Why it cannot issue a grant today

`TRIAL_ENABLED=false`, `TRIAL_GATEWAY_GRANT_BUDGET=0`, and
`TRIAL_MODEL_PAIRS={}` in `.env.example`. Those defaults are deliberate.

The deeper blocker is **verification delivery**: the ledger requires
`users.email_verified_at`, and no route, form, or job in this repository ever
writes that column. A repo-wide search finds it only in the migration
(`lib/db.ts:239`), the ledger read (`lib/trial-ledger.ts:61`), and customer copy.
There is no signup email, verification token, or admin verify action. With the
current tree, every grant attempt returns `false` at the `email_verified_at`
check, regardless of the other settings.

## Relationship to the daily allocation

These are two different free mechanisms and only one is active:

| Mechanism | Scope | Status | Enforcement |
| --- | --- | --- | --- |
| Daily shared allocation | Refills every UTC day | **Active** | `free_pool_allocations` + `free_pool_usage` |
| Lifetime trial grant | One grant per customer, never refills | Disabled | `trial_grants` + `trial_reservations` |

When `TRIAL_ENABLED=true`, `reserveFreeCall` ignores the daily allowance and
admits against the trial ledger (`lib/store/free-pool.ts:200-209`). Both
mechanisms draw on the same shared upstream capacity, so enabling the trial
while the daily allocation is active would need a single shared admission
policy, not two independent counters.

## Activation requirements

1. Implement verification delivery and a writer for `users.email_verified_at`.
2. Choose the lifetime grant size and a positive issuance budget.
3. Configure and validate explicit model pairs; six of eleven stored free rows
   have exact paid-id counterparts and five do not
   (`docs/trial-conversion-contract.md`).
4. Prove the paid wallet is funded before any exhaustion path can route there.
5. Decide the overlap rule with the daily allocation so one customer cannot
   draw both allowances against the same upstream pool.

Until all five hold, the trial stays off. Enabling it to "test" would hand out
real upstream capacity and document behavior the gateway cannot support.
