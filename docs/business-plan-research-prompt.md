# Gemini Deep Research prompt — early-stage business plan

Paste everything below the horizontal rule into Gemini Deep Research. It is
self-contained: no repository access or credentials are needed. Numbers marked
**measured** come from live checks; numbers marked **assumption** must be
challenged rather than accepted.

---

## Role and objective

You are a pricing and business-model strategist for an early-stage AI inference
reseller. Produce a profitable, evidence-based business plan for the first 90
days of a gateway that resells access to a third-party model provider's full
catalog. The operator will not fund the business out of pocket in the early
period: infrastructure and upstream spend must be covered by customer revenue or
by the provider's free allowance.

Deliver a plan that is honest about what the available data can and cannot
support. Do not pad it with generic startup advice.

## 1. The platform

**Product:** Savant Gateway, a self-hosted, OpenAI-compatible HTTP gateway in
front of one or more upstream providers. Customers sign up with email and
password, mint scoped API keys, and call `POST /v1/chat/completions` (JSON and
SSE streaming) or `GET /v1/models` using a standard OpenAI client. The gateway
routes to the upstream provider, meters weighted tokens, and settles charges
locally.

**Implemented today:**

- Provider registry with OpenAI Chat Completions and Anthropic Messages
  adapters, provider-scoped catalog sync, and additive (non-destructive) model
  updates.
- Public catalog of the upstream's full model list with family, context window,
  group, and sell price per 1M tokens; a public API reference page.
- Customer accounts: email/password, scrypt hashes, opaque revocable server
  sessions, per-customer API keys (only hashes stored), usage history.
- Prepaid credit: Stripe Checkout top-ups in $5–$500 increments; credit is
  granted only by a signature-verified, idempotent Stripe webhook.
- Money math: integer micro-dollars, separate upstream cost and sell price,
  default 30% markup, credit holds before dispatch, actual-usage settlement.
- Admin panel: catalog, pricing and markup, groups, providers, customers,
  revenue/cost/margin analytics, Stripe credit grants.
- Model groups as billing tiers: `free`, `paid`, `subscription`.
- Subscription plans and entitlements: implemented and locally tested, **not
  currently offered** (no plans exist; real Stripe recurring delivery unverified).
- One-time lifetime trial grants: implemented but **disabled and inert** because
  no email-verification flow exists.
- A new daily shared free-pool allocation: 90% of the upstream free allowance is
  split evenly across activated accounts each UTC day; 10% is held back as a
  safety reserve. An activated account is an active customer holding at least one
  active API key. An account keeps its grant for the day; accounts added later
  only receive what remains unallocated.
- An operator-editable context banner injected as a system message into every
  upstream request (a promotional line for the operator's other product, "Savant
  Code", aimed at agents using the gateway).

**Not implemented:** email verification, password reset, invoicing/tax, refunds,
team accounts, rate limiting at the gateway boundary (only login/signup/top-up
endpoints are limited), multi-region deployment, hosted SLA, native Anthropic or
Responses downstream APIs (only OpenAI Chat Completions downstream).

## 2. Upstream economics and measured facts

The upstream is APInex (`api.apinex.bond`). Measured on 2026-10-29 with the
operator's account:

- **Free plan:** mode `free`, weighted-token limit **20,000,000 per day**
  (account-wide), reset at `2026-10-30T00:00:00Z`; `allowed: true`;
  **15 requests per minute**; paid wallet balance **$0.00**.
- **Weighting:** the provider charges the allowance at a per-model weight. A
  measured `free/gpt-6-luna` call with 316 raw tokens advanced the provider's
  `tokens_used` by **948** (weight 3). The same weight applies across all
  customers using the account.
- **Catalog:** 45 stored models, 44 currently active, 11 free-pool rows, the rest
  paid or subscription-only. Per-model upstream cost (USD per 1M input and
  output tokens) is stored for paid rows; some rows have unknown cost and cannot
  be enabled until the operator sets it.
- **Subscription-only rows:** at least one `free/*` id (`free/claude-opus-4.6`)
  returns HTTP 402 "subscription only" upstream, so an id prefix is not proof of
  free access.

**Cost structure:** the only variable cost is upstream usage. There is no
committed hosting cost yet (deployment undecided; SQLite + a single Node
process today). Stripe fees apply to top-ups (assume standard card pricing and
state the rate you use). The operator's own time is not costed.

**Revenue structure (not yet proven):** prepaid credit sold at a markup over
upstream cost (default 30%); subscription plans if offered; no other revenue.
Top-ups are prepaid credit, not recognized revenue at purchase; revenue is
recognized when a call settles (`usage_events.charged_micros`) or when a plan
invoice is paid.

## 3. The central problem

The free allowance is the acquisition engine and the capacity ceiling at the
same time. With 20M weighted tokens per day, a weight-3 model consumes 3
allowance tokens per raw input+output token, so the real free capacity is
roughly 6.7M raw tokens per day if every call used a weight-3 model, and 20M raw
tokens if every call used a weight-1 model. That capacity is shared by every
customer. Today the platform has **1 registered user, 2 keys, 3 recorded usage
events, 0 top-ups**. The provider wallet is empty, so any paid model call fails
upstream.

Design tension to resolve:

- The 90% daily split gives early users a large, predictable free allowance and
  grows in relative fairness as accounts join, but it splits the pool thinner as
  the platform grows and it rewards account creation, not payment.
- The lifetime trial (disabled) would give each customer one fixed allowance
  that never grows — better for cost control, worse for acquisition, and it
  requires email verification that does not exist.
- There is no signup verification and no gateway-level rate limit, so one person
  can create many accounts and absorb many shares of the pool. The pool resets
  daily, so the exploit is repeatable.

## 4. Constraints

1. **No out-of-pocket spend early.** Upstream paid usage and infrastructure must
   be funded from top-ups or the free allowance.
2. **Single upstream account.** All customers share its daily free pool and its
   15 RPM. A local subscription or trial grant does not enlarge it.
3. **No real payment acceptance yet.** Stripe test credentials are not
   configured; a real Checkout and webhook delivery have not been exercised.
4. **Money must reconcile.** Sell price, upstream cost, and charged amount are
   separate recorded values; do not propose pricing that the gateway cannot
   express per 1M input and output tokens.
5. **Small team, first day of operation.** Prefer a plan executable by one
   operator with no partnerships, no sales team, and no custom enterprise work.

## 5. What I need from you

Produce a plan with these sections. Use tables where a table is clearer than
prose, and show the arithmetic for every number you assert.

### A. Market and positioning

- Who buys this in the first 90 days: name concrete segments (e.g. agent
  builders, indie SaaS, coding-tool users, students, API arbitrageurs) and the
  job each hires the gateway for.
- Why they would choose a reseller over going direct to the upstream or to a
  first-party lab. Be specific about the wedge (price, catalog breadth, OpenAI
  compatibility, one key for many model families, regional access).
- The two strongest reasons this business fails. Rank them.

### B. Free-allocation policy

- Recommend the free offer: keep the 90/10 daily split, switch to a lifetime
  grant, use a hybrid, or something else. Give the exact rule (pool share,
  eligibility, cap per account, reset behavior) and the expected free-token cost
  per acquired user per month.
- Model the account-farming attack: how many accounts an attacker needs to
  consume 100% of the daily pool, what detection signals exist in the described
  system, and the cheapest effective control (verification, key-bound limits,
  device/IP signals, invite codes, payment-method requirement).
- Define the moment free access should stop: a usage threshold, a time limit, a
  conversion event, or a capacity trigger.
- State the marginal cost of one additional free user under the recommended
  policy, in USD, using a stated per-1M-token upstream cost.

### C. Pricing architecture

- Recommend the paid ladder: prepaid credit only, credit plus subscription, or
  subscription-first. Give exact price points, included volumes, and overage
  behavior.
- Recommend the markup: keep 30%, raise it, or use model-specific margins.
  Show gross margin per 1M tokens for at least three representative models
  (one cheap/fast, one mid, one frontier) at your recommended prices, using
  plausible upstream costs and labeling them as assumptions.
- Address prepaid-credit psychology: minimum top-up, expiration, refund policy,
  and what happens at zero balance.
- Decide whether the disabled lifetime trial and the subscription product should
  be launched at all in the first 90 days, and justify it against the cost of
  building verification and payment acceptance.

### D. Unit economics

Build a table with, per customer cohort: free cost, conversion rate, average
top-up, gross margin per top-up, Stripe fees, payment failure rate, and payback.
Give three scenarios (pessimistic / base / optimistic) with explicit
assumptions. State the break-even condition in terms of paying customers,
top-up volume, and daily pool utilization.

### E. Growth plan

- Propose the acquisition loop that fits a zero-budget start. Consider the
  in-context banner for the operator's other product, public model catalog and
  price pages, open-source client snippets, and community launches. Rank by
  expected customers per hour of operator effort.
- Propose the retention loop: what makes a customer come back after the free
  allowance ends.
- Give a 90-day week-by-week plan with one measurable goal per week.

### F. Risks and controls

- Capacity risk: what happens when the daily pool is exhausted at 10:00 UTC, and
  what the product should say and do.
- Revenue risk: prepaid credit is a liability; a customer can pay once and
  consume for months. Quantify the worst case and propose a control.
- Counterparty risk: the reseller depends on one upstream account with a $0
  wallet and unverified paid terms. Propose a contingency.
- Abuse, fraud, and chargeback risk with a concrete control list.
- Legal/compliance questions a solo operator must answer before charging money
  (resale terms, tax, refunds, data handling). Flag them; do not give legal
  advice.

### G. Dashboard and decision rules

- Define the 8–10 metrics the operator should watch weekly, with formulas.
- Give explicit go/no-go thresholds: when to raise prices, when to shrink the
  free allocation, when to stop acquiring, when to launch subscriptions.
- Name the single experiment that most reduces uncertainty in week one.

## 6. Output rules

- Mark every input as **measured**, **assumption**, or **recommendation**.
- Cite public sources for market benchmarks, provider pricing, Stripe fees, and
  comparable reseller pricing; include the URLs. Do not invent citations.
- Where the data is insufficient, say so and give the range you would use,
  rather than a single confident number.
- No generic advice ("focus on product-market fit", "build a brand"). Every
  recommendation must be specific enough to execute this week.
- Keep the whole answer under 4,000 words. Put the arithmetic in tables.

## Appendix — data snapshot (2026-10-29)

| Item | Value |
| --- | --- |
| Upstream daily free allowance | 20,000,000 weighted tokens, resets 00:00 UTC |
| Free allowance allocation share | 90% (18,000,000 allocatable) |
| Safety reserve | 10% (2,000,000) |
| Upstream free-plan rate limit | 15 requests/minute, account-wide |
| Upstream paid wallet | $0.00 |
| Stored models / active | 45 / 44 |
| Free-pool model rows | 11 |
| Registered users / active keys | 1 / 2 |
| Recorded usage events | 3 |
| Completed top-ups | 0 |
| Active plans / subscriptions | 0 / 0 |
| Default markup | 30% over upstream cost |
| Top-up range | $5–$500 |
| Downstream API | OpenAI Chat Completions (JSON + SSE) only |
