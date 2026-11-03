# FID: Free model pages explain the allocation and how to use it

**Filename:** `FID-2026-1103-147-free-model-allocation-guide.md`
**ID:** FID-2026-1103-147
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03 21:30
**Automation level:** 2
**YAGNI-Compliance:** Verified — one detail-page panel, one pure display helper, no
new endpoint or storage.

## Summary

A free SKU detail page currently shows the catalog price block with one generic
sentence about shared capacity. It does not tell the signed-in customer what
they can spend today, what a weighted token means on that model, when the
allowance resets, or how to make a first call. The account page has the balance,
and the docs have fragments of the rules, but the page a customer reaches from
the free catalog row does not connect the two.

## Environment

- **OS:** Windows, Git Bash
- **Language/Runtime:** Node 22, Next.js 16 App Router
- **Tool Versions:** npm, TypeScript strict
- **Commit/State:** `48158c9`, clean working tree

## Detailed Description

### Problem

`app/models/[...id]/page.tsx` renders the free row's price block and a sentence:
"Free-pool access depends on shared upstream capacity and is metered by the token
weight shown above." The page already has the customer session, but it does not
read the daily or one-time allocation. A customer cannot answer:

- How many weighted tokens do I have right now?
- What does the model's weight mean for a request?
- When does the allowance reset, and does it carry over?
- Does free usage debit prepaid credit?
- What should I do when a free call is refused?

### Expected Behavior

A free SKU detail page shows a self-contained free-allocation section:

1. A signed-in customer sees their own current daily allocation (`available`,
   `allocated`, `used`, `reserved`) or their one-time trial balance (`available`,
   `granted`, `used`, `reserved`), plus the raw-token equivalent on this model.
2. A signed-out visitor sees the rules and a sign-in path, not invented numbers.
3. The same section explains the weighted-token rule, reset/carryover, the
   separation from prepaid credit, refusal behavior, subscription precedence,
   and where to check exact usage.
4. A short walkthrough uses the actual SKU id in an OpenAI-compatible request.
5. A database or observation failure renders an honest unavailable state, never
   a 500 and never a zero balance that looks real.

### Root Cause

The detail page only calls `getCatalogData` and reads identity/content side
data. Allocation display lives in `components/account/daily-trial-balance.tsx`
and `components/account/trial-card.tsx`; neither is rendered on a public model
page, and the page never branches on `model.access === "free"` for account
state.

### Evidence

```text
app/models/[...id]/page.tsx:127-137
{model.access === "free"
  ? "Free-pool access depends on shared upstream capacity and is metered by the token weight shown above."
  : ...}
```

The only customer-specific read on the page is `getCustomerSession`, used for
content watches and the coverage panel. It does not fetch `DailyTrialSummary`
or `TrialBalance`.

## Impact Assessment

### Affected Components

- `app/models/[...id]/page.tsx`
- `components/catalog/free-allocation-panel.tsx` (new)
- `components/catalog/free-allocation-guide.tsx` (new)
- `lib/free-pool.ts`
- `tests/free-pool.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium — the page remains usable, but the free product's central limit is
  unexplained at the point of purchase.

## Proposed Solution

1. **implemented:** Add `rawTokensForWeight` beside `estimateWeightedTokens` in
   `lib/free-pool.ts`. It is the display inverse: a weighted balance divided by
   the same effective weight the admission path uses, never below 1.
2. **implemented:** Add `FreeAllocationPanel` for the free SKU detail page. It
   renders the customer's daily or one-time balances when they are current,
   otherwise a facts grid (access, weight, reset, credit) and an honest state
   message. No provider pool size, account cap, or other operator setting is
   exposed.
3. **implemented:** Add `FreeAllocationGuide` with the FAQ and a copyable `curl`
   walkthrough using the exact public model id and the configured site origin.
4. **implemented:** In the page, read the allocation only when
   `model.access === "free"` and a customer session exists. Daily mode uses
   `getDailyTrialSummary`; one-time mode uses `trialBalance`. Any failure sets
   `allocationUnavailable` and leaves the rest of the page intact.
5. **implemented:** Link to `/account` for exact balances and key management. Do
   not add a new client refresh endpoint; the account card already owns that
   behavior.
6. **implemented:** Add a focused unit test for the raw-token conversion and keep
   every touched file under the 400-line ceiling.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/free-pool.test.mjs — `node --test tests/free-pool.test.mjs`
- gate: quality — `npm run quality`
- gate: build — `npm run build`

### Verification Receipt

- verified: 2026-11-03T21:41:47Z
- lint: exit 0; the four touched files are clean. Six pre-existing warnings
  remain in the untouched `lib/launch-receipt.ts` (formatting only).
- typecheck: exit 0
- test tests/free-pool.test.mjs: exit 0, 14 tests pass
- quality: exit 0, PASS (400-line ceiling, 592 files scanned)
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** A signed-in customer sees no current allocation; a signed-out visitor
  sees only "shared capacity"; a failed read could render a misleading zero; a
  daily allowance and a one-time trial have different reset semantics.
- **GREEN:** The page branches on free access and trial mode; the panel uses
  `remainingTokens !== null` and `available` before showing a balance; failures
  use a separate unavailable state; daily and lifetime copy are distinct.
- **AUDIT:** The displayed numbers come from the same functions the account page
  uses (`getDailyTrialSummary`, `trialBalance`) and the same weight field the
  gateway admission path uses (`model.tokenWeight`).
- **ADVERSARIAL:** Signed out; no active key; stale observation; zero remaining;
  no trial grant; database error; trial enabled after the page reads config;
  weight zero or negative; a model id containing `/` in the curl body.
- **CHANGE DELTA:** 5%; converged before implementation.

### Missed Questions

1. **Does this page write allocation state?** `getDailyTrialSummary` may lazily
   record today's allocation, exactly as the account page does. It is
   idempotent and is the only way to display the same share admission will use;
   no new write path is introduced.
2. **Should the page show pool size or per-account caps?** No. Those are
   operator policy and can change; the customer needs their permitted amount
   and the rule, not internal capacity figures.
3. **Should the panel refresh itself?** No. A server render is enough for a
   detail page; `/account` already has the explicit check and live refresh.
4. **What if the observation is stale?** `getDailyTrialSummary` reports
   `available: false` when the observation is not current; the panel must not
   show the stored allocation as spendable.
5. **What if `TRIAL_ENABLED` changes between the page's mode read and the
   summary?** The summary returns `null` in trial mode; the panel falls back to
   the facts grid instead of showing a zero balance.

## Implementation Evidence

- [x] **Commit SHA:** `d02ec42` — `feat(catalog): explain free allocation on
  model pages (FID-147)`.
- [x] **File:line ranges:**
  - `app/models/[...id]/page.tsx:75-95` — free-only allocation read with an
    isolated failure flag.
  - `app/models/[...id]/page.tsx:177-184` — panel wiring.
  - `components/catalog/free-allocation-panel.tsx:50-126` — facts and reset
    rendering; `:128-199` — daily and lifetime balances; `:202-290` — signed-in,
    unavailable, no-key and unobserved states; `:294-385` — panel and CTA.
  - `components/catalog/free-allocation-guide.tsx:16-75` — mode-aware FAQ;
    `:77-205` — walkthrough and copyable request.
  - `lib/free-pool.ts:85-98` — `rawTokensForWeight`.
  - `tests/free-pool.test.mjs:84-88` — conversion test.
- [x] **Gate output:** `node --test tests/free-pool.test.mjs` passed 14/14;
  `npm run typecheck`, `npm run quality` and `npm run build` exited 0 at
  `2026-11-03T21:41:47Z`.
- [x] **Reproducibility:** `grep -n "FreeAllocationPanel" "app/models/[...id]/page.tsx"`
  finds the component; `grep -n "rawTokensForWeight" lib/free-pool.ts` finds
  the helper; `grep -n "Free allocation FAQ" components/catalog/free-allocation-guide.tsx`
  finds the guide.
- [x] **Step statuses:** all six Proposed Solution steps are `implemented`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence is present for new or repaired wiring
- [x] FID status reflects the actual implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** The first draft overclaimed two paths. It said free usage never
  touches credit, but a plan with credit overage resolves before the free pool,
  and a one-time trial that cannot cover a request can settle on its configured
  paid pair. It also described "allocated" as a pool share even when daily
  allocation is disabled and the fixed fallback applies.
- **GREEN:** Copy is now mode-specific: daily explains the plan-overage
  exception, lifetime explains the paired-credit fallback, and the allocated
  card says "your recorded allowance" rather than asserting a pool split.
- **AUDIT:** `lib/storage/gateway/call.ts:226-257` resolves subscription access
  before the free branch; `lib/storage/gateway/trial.ts:105-132` reserves credit
  on the paired model after `trial_exhausted`;
  `lib/storage/store/daily-trial.ts:57-87` sets the fixed fallback and null
  remaining when capacity is unavailable.
- **ADVERSARIAL:** Signed out; no active key; stale observation; zero remaining;
  no trial grant; database failure; trial enabled between config read and
  summary; zero or malformed token weight; model id containing `/`; a plan with
  credit overage.
- **CHANGE DELTA:** 8%; converged.

### Loop 3 — Final convergence

- **RED:** A late copy review still claimed the usage ledger records the billing
  source. The account surface shows a usage table with a charge, not a billing
  source column. The signed-out status also said "daily split" in lifetime mode.
- **GREEN:** The FAQ and walkthrough now name the usage table and its recorded
  charge; the signed-out status says "free allocation" for both modes. The
  header says "free-pool admission" instead of the broader "free usage".
- **AUDIT:** Final gates: lint exit 0, typecheck exit 0, focused test 14/14,
  quality PASS and build exit 0. `app/models/[...id]/page.tsx` is 284 lines and
  `components/catalog/free-allocation-panel.tsx` is 385 lines, both under 400.
- **ADVERSARIAL:** No browser visual pass was run; the page is server-rendered
  and the build plus typecheck prove the wiring compiles. The displayed balance
  is the stored observation, not a live upstream call; the copy says so and
  links to the account card that can request a fresh check.
- **CHANGE DELTA:** 2%; converged.

## Resolution

- **Closed Date:** 2026-11-03 21:43
- **Fix Description:** Free SKU detail pages now load the signed-in customer's
  daily or one-time allocation and render a free-allocation panel with current
  balances, raw-token equivalent, reset/check context, a mode-aware FAQ and a
  copyable first-call walkthrough. Signed-out visitors get the rules and a
  sign-in path; missing observations, no-key, no-grant and storage failures
  render explicit states rather than a zero balance.
- **Tests Added:** Yes — `tests/free-pool.test.mjs` covers the raw-token
  conversion, including zero and malformed weights.
- **Verification Evidence:** `d02ec42` was built with `npm run typecheck`,
  `node --test tests/free-pool.test.mjs` (14/14), `npm run quality` and
  `npm run build`, all exit 0. `npm run lint` exits 0; the touched files are
  clean, with six pre-existing formatting warnings in the untouched
  `lib/launch-receipt.ts`.
- **Archived:** `dev/fids/archive/FID-2026-1103-147-free-model-allocation-guide.md`.

## Lessons Learned

The page that sells a metered free product must state the meter and the current
balance in the same place. A generic capacity sentence is not an allocation
explanation, and a zero rendered from a failed read is worse than an honest
unavailable state.
