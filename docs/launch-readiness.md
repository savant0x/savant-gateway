# Launch readiness

Status: pre-launch work active, 2026-10-29. This document distinguishes current behavior from
the proposed offering. An unchecked item is not implemented or verified.

## Offering

The intended customer journey is a one-time allocation of weighted trial tokens,
followed by prepaid paid inference. Exhaustion stops requests and prompts a
top-up. Once funded, an explicitly paired paid upstream model serves subsequent
requests under the same public model id and customer key. Exhausted paid credit
stops requests; it never renews the trial.

The trial size is an operator decision. The discussed 100,000 weighted tokens
is a proposal, not an enabled entitlement. The current platform instead has a
recurring per-user daily free allowance and separate credit/subscription paths.

## Upstream capacity

APInex account verification on 2026-10-29 returned a 20,000,000 weighted-token
free limit, mode `free`, and `resets_at_utc: 2026-10-30T00:00:00.000Z`.
Its balance documentation describes the allowance as daily and account-wide.
This is a measured account configuration, not a contractual future guarantee.

All customers using that upstream account share its capacity. A weight-3 model
uses three allowance tokens per raw input-plus-output token. A gateway trial
grant, local subscription, or customer payment does not enlarge this pool.
An upstream daily reset replenishes gateway capacity, not personal trials.

Sources: [reseller guide](https://apinex.bond/developers/resell),
[balance and subscription reference](https://apinex.bond/developers/balance),
[billing reference](https://apinex.bond/developers/models/billing).

## Before enabling trial conversion

- [ ] Choose the lifetime trial size, eligible models, and eligibility rules.
- [ ] Implement an atomic trial ledger: grants, reservations, actual weighted
  settlement, exhaustion, and one-time issuance. New keys cannot mint trials.
- [ ] Replace automatic daily customer free access with the lifetime trial.
- [ ] Configure explicit free-to-paid model pairs. Never silently substitute a
  different model where a corresponding paid version is unavailable.
- [ ] Implement the funded routing transition and show trial versus paid usage,
  remaining balances, prices, and exhaustion honestly in the customer UI.
- [ ] Refresh upstream capacity automatically; enforce a shared safety reserve
  and concurrent holds across every local billing mode. Handle UTC reset,
  unlimited plans, unavailable quota reads, and upstream subscription-only rows.
- [x] Preserve upstream weights on subscription-only models and correct metadata
  mapping for public `contextWindow` versus authenticated `context_window`.
  FID-014 fixes the sync builder with six new regression tests. Applies on
  subsequent sync; the live catalog was not mutated by verification.
- [ ] Record exact upstream billed `usage.cost_tokens` when available, separately
  from customer charges; verify JSON and streaming settlement.
- [ ] Enforce shared upstream RPM capacity and customer abuse controls. Provider
  account limits are shared even when customers have different gateway keys.
- [ ] Establish signup verification and a gateway-wide trial budget so automated
  account creation cannot consume the acquisition allowance unchecked.

The concrete persistence, admission and model-pair proposal is in
`trial-conversion-contract.md`. Six of eleven stored free models have exact
paid-id counterparts; the other five must not receive guessed substitutions.

## Payment and funding setup

Operator instruction, 2026-10-29: "I will fund a wallet later and make the stripe
as well but make a doc outlining the needs and when we get closer to a launch
we'll knock out those details."

These are pre-launch requirements, not prerequisites for the visual redesign.

- [ ] Fund the APInex paid wallet. Set a low-balance alert and an operating
  reserve; customer payments do not automatically fund the upstream account.
- [ ] Configure Stripe test credentials and webhook signing secret in
  `.env.local` only. Verify a real test Checkout, signed delivery, duplicate
  delivery, amount/currency checks, and customer balance fulfillment.
- [ ] Decide whether subscriptions remain purchasable at launch. Local plan
  allowances must have a funded upstream capacity and cost budget.
- [ ] If subscriptions are enabled, test real recurring invoices, failed payment,
  cancellation, renewal, and customer portal access.
- [ ] Configure production Stripe credentials, canonical HTTPS origin, webhook
  URL, enabled events, and return URLs. Keep secrets out of browser code and Git.
- [ ] Decide refund, dispute, promotional-credit, expiration, and usage policies;
  publish accurate terms, privacy, pricing, and support information.

## Deployment and acceptance

- [ ] Choose hosting with persistent SQLite storage, backups and tested restore,
  HTTPS, secure cookies, log retention, and monitoring. Validate process count
  against any process-local rate limiting.
- [ ] Verify proxy buffering and timeouts permit SSE streaming, with cancellation
  and failed settlement observable.
- [ ] Run `npm run verify`: lint, typecheck, unit tests, quality, production build,
  and the disposable-database HTTP suite.
- [ ] Exercise signup → trial → exhaustion → actual payment → paid model → exact
  settlement → exhaustion through the gateway with a disposable customer.
- [ ] Test concurrent admission, replay, cross-account isolation, errors,
  streaming, shared pool exhaustion, and the upstream daily reset.
- [ ] Review mobile layouts, keyboard operation, focus, contrast, form errors,
  empty states, and reduced-motion behavior across public/account/admin pages.
- [ ] Confirm client promises: Chat Completions exists today; native downstream
  Messages and Responses are not implemented. Verify any advertised client path.
- [ ] Obtain explicit production deployment/release approval.

## Evidence already obtained

On 2026-10-29, `npm run test:http` exited 0 with `100 checks PASS`, including
gateway completion and exact paid settlement against a mock upstream. A separate
live APInex Chat Completions request returned HTTP 200 with `gateway-ok` and
315 raw tokens. These checks do not prove a live payment, a funded paid upstream
call, or the proposed trial-to-paid transition. None of those are claimed ready.
