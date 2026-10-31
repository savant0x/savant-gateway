# FID-2026-1031-078 — Free-credit grants and promo codes

- **Status:** closed
- **Severity:** high
- **Created:** 2026-10-31
- **Closed:** 2026-10-31
- **Commit:** `7996124`
- **Automation:** 3
- **Depends on:** FID-2026-1031-079 (activity log)
- **Related:** FID-2026-1030-044 (offering and economics), FID-2026-1030-049 (free access)

## 1. Summary

Scaffold an operator-controlled free-credit path and a promo-code system that
grants prepaid dollar credit into the existing credit ledger. The existing
`free` billing source and its weighted-token daily allocation stay exactly as
they are. A promo code is a one-time grant of wallet credit, not a second
balance and not a change to the free pool.

The feature is default-off: `PROMO_CODES_ENABLED` must be `true` before a
customer can redeem. An operator can issue, list, pause, and expire codes. Codes
are stored as SHA-256 hashes and shown in full exactly once at creation.

## 2. Environment

Windows 11, Node 24.21.0, Next 16.4.3, SQLite `better-sqlite3`. Promo credit is
denominated in integer micro-dollars; USD is never stored as a float.

## 3. Problem / expected behavior

**Observed.** The only way to add credit is the admin `POST /api/admin/credit`
endpoint for one customer id. There is no reusable code, no per-code cap, no
expiry, no redemption record, and no customer-facing way to claim an offer. The
existing "free" path is a weighted-token allocation, not a dollar balance.

**Expected.** An operator can create a code with a fixed dollar amount, a
redemption cap, and optional start/expiry dates. A signed-in customer can redeem
it once. Redemption is transactional: the code row, the credit balance, the
ledger entry, and the activity event either all commit or none do. A concurrent
double redemption debits the code exactly once.

## 4. Root cause

The credit ledger was built for Stripe top-ups and manual admin grants. It has
no notion of a redeemable offer, so there is no place to store code state or a
redemption identity. The admin grant path has no idempotency key or source
attribution beyond free-form note text.

## 5. Impact

- **Affected:** account page, credit ledger, admin panel, database schema.
- **Unaffected:** free-pool allocation, provider routing, subscription
  entitlements, Stripe fulfillment, USDC receive lane.
- **Risk:** a promo is money. A non-transactional grant or a missing unique
  redemption constraint would let one code mint unlimited credit.

## 6. Proposed implementation

1. `lib/promo-codes.ts`: pure normalization, format validation, amount parsing,
   display masking, and the `PROMO_CODES_ENABLED` policy reader.
2. `lib/schema/promos.ts`: `promo_codes` and `promo_redemptions` tables plus
   additive indexes. `promo_redemptions` has a unique
   `(promo_code_id, user_id)` constraint and a unique ledger reference.
3. `lib/store/promos.ts`:
   - `createPromoCode` generates a random code when none is supplied, hashes it,
     stores only the hash and a display prefix, and returns the plaintext once.
   - `listPromoCodes` returns status, amount, redemption count, cap, and dates;
     never the hash or plaintext.
   - `setPromoCodeStatus` supports `active`, `paused`, `archived`.
   - `redeemPromoCode` checks enabled, format, active window, cap, existing
     redemption, and rate limit, then runs one `db.transaction` that increments
     the code, inserts the redemption, credits the balance, writes a `promo`
     ledger row, and writes the activity event.
4. Admin `GET/POST /api/admin/promos` and `PATCH /api/admin/promos/[id]`.
5. Customer `POST /api/account/promos` with a per-customer attempt limiter.
6. Admin promo panel and account promo card; the account card renders only when
   the deployment flag is on.
7. Tests: format and amount boundaries, default-off refusal, one-time
   redemption, concurrent redemption, cap, expiry, pause, and ledger balance.
8. HTTP suite: admin create, customer redeem, second redeem conflict, disabled
   flag refusal.
9. `.env.example` and operator docs.

## 7. Verification gates

```bash
node --test tests/promos.test.mjs
npm run lint
npm run typecheck
npm run quality
npm run build
npm run test:http
```

A unit test that only mocks the store is not evidence. The concurrency test
opens the real SQLite database and races two redemptions.

## 8. Perfection Loop

### RED

- No promo table, no code format, no redemption uniqueness.
- `PROMO_CODES_ENABLED` is unset and a redemption would be possible if code
  existed.

### GREEN

- A created code redeems once and credits exactly its amount in micro-dollars.
- The second redemption returns `already_redeemed`; balance and ledger do not
  change.
- A paused, expired, exhausted, or malformed code grants nothing.
- Disabled flag returns a refusal before any database write.

### AUDIT

- Plaintext code is never stored, logged, or returned by list endpoints.
- Amount parsing rejects zero, negatives, over-precision, and values above the
  configured maximum.
- The credit ledger `reference` is unique per redemption.
- The admin list shows the prefix and label, not the full code.
- The transaction rollback path leaves no partial redemption.
- Activity metadata contains the promo id and amount, not the code.

### ADVERSARIAL

- **Double submit:** two requests race; unique constraint plus transaction
  serialization allows one.
- **Case and whitespace:** `SAVE-10` and ` save-10 ` normalize to one hash.
- **Clock boundary:** start and expiry compare UTC instants; a code at its exact
  expiry is refused.
- **Cap:** increment and redemption insert happen inside one transaction; cap
  cannot be exceeded.
- **Flag:** toggling off after creation blocks redemption without deleting
  issued codes.
- **Admin misuse:** creating a 0 or $10,000 code is refused.
- **Enumeration:** a random 12-character code space and attempt limiter make
  guessing impractical; invalid and expired return the same generic customer
  message.

### Missed questions

- Is this a second balance? No. It credits `credit_balance_micros`, the same
  balance Stripe top-ups use.
- Does promo credit expire? The code expires; the credited dollars do not.
  Expiring wallet dollars would require a separate ledger policy and is not
  part of this scaffold.
- Does this affect the free pool? No.
- Can an operator read a code after creation? No. This is deliberate; reissue
  instead.
- Is the default-off flag honest? Yes. The admin panel says the lane is disabled
  and the customer card is hidden.

## 9. Non-goals

- Referral programs, multi-use links, or automatic campaign attribution.
- Per-customer eligibility rules beyond one redemption per code.
- Wallet-dollar expiry or clawback.
- Crypto or card purchase changes.

## 10. Implementation evidence

- `lib/promo-codes.ts` owns the 12-character alphabet, normalization, SHA-256
  hash, prefix, policy flag, amount cap ($500) and redemption cap (10,000).
- `lib/promo-ledger.ts` is database-parameterized and testable without the
  `server-only` boundary. `lib/store/promos.ts` is a thin production wrapper.
- `lib/schema/promos.ts` adds `promo_codes` and `promo_redemptions`, including
  the unique `(promo_code_id, user_id)` and unique `ledger_id` constraints.
- `app/api/admin/promos` creates/lists codes; `[id]` pauses/reactivates.
  `app/api/account/promos` redeems with a 10/hour account limiter. The account
  card renders only while `PROMO_CODES_ENABLED=true`; the admin panel always
  shows the lane state and can issue codes while closed.
- `tests/promos.test.mjs` (6 tests) covers default-off policy, format/hash,
  first redemption, repeat refusal, cap, paused/not-started/expired/disabled,
  amount bounds, duplicate codes, and activity metadata.
- The HTTP suite adds 9 checks: admin protection/origin, create, hash-at-rest,
  customer redemption, repeat 409, concurrent redemption (exactly one 200 and
  one 409, exactly one ledger row), pause, paused refusal, and activity output
  without the full code.

Verification: focused promo tests 6/6; full `npm test` 394 pass; `npm run
build` 0; `npm run test:http` 750 checks + trial suite PASS; lint/typecheck/
quality PASS. No live payment lane was involved: credit is granted from the
operator-issued code, not from a purchase.

## 11. Closure

Closed against `7996124` on 2026-10-31. The lane remains default-off; no code
has been issued to a real customer and no delivery channel exists. Those are
recorded as `FID-2026-1031-078-LIVE` in `dev/tracking/internal-followups.json`,
not claimed as implementation.
