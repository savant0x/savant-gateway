# Assessment: Gemini's 90-day commercialization plan

**Source:** [`docs/research/gem-review.md`](gem-review.md)
**Assessed:** 2026-10-29 against `data/gateway.db`, `lib/`, and the built app.
**Verdict:** the abuse and liquidity arguments are correct and worth acting on; the
pricing tables rest on invented wholesale costs, and one failure diagnosis is
wrong about our own catalog. Do not paste the roadmap in as-is.

---

## 1. Claims I verified as true

| Claim                                                                             | Evidence                                                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Upstream is a single relay with **15 RPM**, a **free** plan and **$0.00** balance | `providers` row `savant`: `rpm=15`, `rpm_plan='free'`, `balance_usd=0`                                                             |
| The free pool is split equally with no per-account ceiling                        | `lib/allocation.ts` (90% of 20M, even split), `lib/store/allocations.ts`                                                           |
| Nothing limits request rate on the paid data path                                 | only `lib/customer-rate-limit.ts` (signup/login/top-up) and `lib/admin-rate-limit.ts` exist; `/v1/chat/completions` has no limiter |
| Accounts may hold unlimited API keys                                              | `api_keys` has no cap; the dev account holds 2                                                                                     |
| Email verification cannot happen                                                  | `users.email_verified_at` exists (`lib/db.ts:240`) but no route, token, or job writes it                                           |
| The $5 minimum top-up is real                                                     | `TOPUP_MIN_USD = 5` in `lib/topup-amount.ts`                                                                                       |
| 44 active catalog models                                                          | `models WHERE in_catalog = 1` = 44                                                                                                 |
| Card processing drag on $5 is ~8.9%                                               | 2.9% × $5 + $0.30 = $0.445 = 8.90% of $5                                                                                           |

The multi-account attack is real and the arithmetic is right: with one legitimate
account and 99 synthetic ones, an attacker takes 99% of the 18M daily pool,
repeatable daily. Nothing in the codebase currently charges for account creation,
verifies an inbox, or limits requests per key, so the marginal cost of that attack
is zero.

## 2. Claims that are wrong or unsupported

**"Node.js / Express / SQLite middleware."** There is no Express. Routing is
Next.js 16 route handlers (`app/v1/chat/completions/route.ts` → `lib/gateway.ts`)
with SQLite behind `better-sqlite3`. The topology diagram's box labels are wrong
even though the flow it draws is roughly right.

**"`free/claude-opus-4.6` throws HTTP 402 despite its free prefix."** This
misreads our catalog. That row is upstream-marked `allowFree=false` with weight 3,
so `lib/providers/catalog.ts` classifies it **subscription-only**, not free. The
`free/` prefix is an upstream naming artifact, not an access grant; our gateway
never advertises it as free (`group_slug='subscription'`, sell rate 0, "plan
only" on `/models`). It is not an upstream defect and delisting it would delete a
working plan-tier row.

**Wholesale prices of $0.10/$0.30, $1.00/$3.00, $5.00/$15.00.** Invented. Our
synced catalog runs **$0.04 to $2.00** per 1M on input, median **$0.15**, and 23
priced rows averaging **$0.287** in / $0.374 out. The frontier tier it models at
$7.50 blended per 1M is roughly 25× our most expensive row. Every downstream
figure that inherits these prices — the 23%/27%/29% blended margins, the $14.60
fulfilment cost per $20 deposit, contribution margin, break-even count — is
therefore fiction, even where the arithmetic inside the table is correct.

**"Blended 3:1 input:output" with equal in/out prices.** Our feed prices input and
output identically on 40 of 45 rows (FID-020 caveat). A 3:1 blend changes nothing
today, but it will mislead the moment real per-direction costs arrive.

**Unverified external claims:** OpenRouter's 5.5% / $0.80 / 365-day terms, Token
Harbor's pass pricing, and "ApinexGate authorizes commercial resale". None of
these were checked here and none should be relied on in a doc until captured with
a source and date, the way `docs/provider-prices.json` does for Apixo.

## 3. Where the plan is right, and better than what we have

1. **A per-account daily ceiling, independent of the even split.** Equal division
   makes one account worth 18M/day and twenty accounts worth 900k each. Early
   adopters get a firehose they cannot spend and cannot bank; later ones get a
   tier that no longer onboards anyone. A hard cap (its 100k weighted/day figure
   is reasonable) plus a pool-wide ceiling bounds per-identity bleed without
   changing the pool maths.
2. **Boundary rate limiting before the upstream.** With a 15 RPM account ceiling
   and no gateway limiter, one free account running three parallel agents can
   starve paid customers. This is the single cheapest protection available and
   needs no new infrastructure.
3. **Raise the minimum top-up off $5.** At 2.9% + $0.30, $5 costs 8.9% and $10
   costs 5.9%. Our presets are already 10/25/50/100; only the floor allows $5.
4. **Tiered markup instead of a flat 30%.** A single `pricing.markup_bps` means a
   $0.04 row and a $2.00 row earn the same percentage. Cheap rows need a higher
   markup for the fixed fee per request to be worth serving; frontier rows cannot
   carry 30% and stay competitive. The mechanism does not exist yet — markup is
   one global setting and plan overage applies its own bps.
5. **Prepaid float is the funding mechanism.** Correct, and it is already how the
   ledger works: credit is charged at top-up and released only as calls settle.
   The "1:1 float reserve" rule is a policy we should write into the business doc
   rather than a feature.

## 4. Where I disagree with the plan

- **A 1,000,000-token lifetime cap needs verification delivery first**, not a new
  number. The lifetime trial ledger already exists with an immutable grant and a
  budget; what blocks it is that `email_verified_at` is never written. Copying the
  cap into the trial without fixing verification produces either zero grants or
  free multi-account grants.
- **3 RPM on free keys is too blunt as a first step.** It will break the agent
  workflows the gateway is for (a single Claude Code turn issues bursts). A token
  bucket sized to the 15 RPM upstream ceiling, shared across free traffic, protects
  paid customers without capping legitimate bursts to nothing.
- **"Delist rows that error"** conflicts with our own policy of marking rows
  disabled rather than deleting them, and with the upstream's right to be
  temporarily wrong. Mark unavailable, keep history.
- **The 12-week roadmap front-loads Stripe production work.** We already ruled to
  sell no plans at launch; the week-1 through week-4 items that matter are funded
  upstream testing, error normalisation and abuse controls, not recurring billing.
- **Proof-of-work signup** is a real answer to scripting but a heavy one for a
  first-day build; disposable-domain and subnet throttling cover the same attack at
  a fraction of the complexity.

## 5. Recommended order, with effort

| #   | Change                                                                             | Effort | Why first                                                                   |
| --- | ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 1   | Token-bucket limiter on `/v1` per key, shared free budget under the 15 RPM ceiling | S      | Protects the only upstream we have; no schema change                        |
| 2   | Per-account daily weighted-token ceiling inside the existing allocation            | S      | Closes the 99-account attack; the ledger already tracks the usage           |
| 3   | Minimum top-up $5 → $10                                                            | XS     | Removes an 8.9% processing drag on the smallest ticket                      |
| 4   | Disposable-domain and per-subnet signup throttle                                   | M      | Needs a domain list and a sliding window; do after 1–2                      |
| 5   | Per-group markup (cheap / mid / frontier)                                          | M      | Needs a settings and pricing shape change; do when volume exists to measure |
| 6   | Provider failover on upstream 5xx/429                                              | M      | Apixo is registered but unsynced, so there is nothing to fail over to yet   |
| 7   | Readable abuse telemetry on the dashboard (signups per subnet, keys per account)   | S      | Makes the controls above observable                                         |

Items 1–3 are the ones I would do now: each is small, each is verifiable, and each
prevents a loss that grows with traffic rather than shrinking.

## 6. What the research did not know

- A second and third upstream are already registered (`commandcode`, `apixo`), so
  "single-relay failure" is a configuration gap, not an architectural one.
- The business doc (`docs/business-model.md`) now computes free-allowance exposure
  and break-even revenue from real catalog costs; its numbers supersede the
  assumed-margin tables above.
- Rate limiting exists in the repository, just not on the paid path, so item 1 is
  reuse rather than new design.
