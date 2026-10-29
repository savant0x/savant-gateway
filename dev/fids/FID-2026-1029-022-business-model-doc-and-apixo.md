# FID: Business-model document and the third upstream

**Filename:** `FID-2026-1029-022-business-model-doc-and-apixo.md`
**ID:** FID-2026-1029-022
**Severity:** medium
**Created:** 2026-10-29 23:05
**Automation level:** 3
**YAGNI-Compliance:** Verified — one pure economics module, one generator, one
dated price snapshot, plus a provider row and a shared auth-header helper. No
database table, no migration of existing rows, no new dependency.

---

## Summary

Three upstreams are now in the plan (Apinex, CommandCode, Apixo), but nothing in
the repository stated what any of them charges, what the free allowance would
cost if it had to be bought, or how much paid revenue is needed before that
exposure is covered. This FID adds a generated business-model document, records
Apixo's published rates with a capture date, registers Apixo as a disabled
provider, and makes dual-format providers authenticate both wire formats so a
shared base URL works.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, better-sqlite3
- **Commit/State:** `6947f9e` + working tree

## Detailed Description

### Problem

- No repository document connects provider cost, sell price, markup, and the
  free allowance. The numbers lived in one local `data/gateway.db`.
- Apixo (https://apixoai.online) publishes per-model rates but has no
  machine-readable price feed, so a comparison can only be captured as dated
  data.
- `providerHeaders` sent only `Authorization: Bearer` for `kind: "both"`.
  Apixo documents `x-api-key` + `anthropic-version` for its Anthropic route and
  Bearer for its OpenAI route, so one of the two would be unauthenticated.

### Expected Behavior

- `npm run business-model` regenerates the numeric section of
  `docs/business-model.md` from the database and the snapshot.
- The document states provider inventory, per-group economics, free-allowance
  exposure, the revenue required to carry it, the Apixo pivot, and recorded
  traffic.
- `apixo` exists as a provider row, disabled, with `APIXO_API_KEY` as its key
  variable, and cannot be enabled into a failing state by accident.
- A dual-format provider sends both credentials; single-format providers send
  only their own.

### Root Cause

The gateway was built for one upstream and one operator; pricing knowledge was
in the operator's head and in the database, not in reviewable documentation.

### Evidence

```text
lib/providers/request.ts   providerHeaders: anthropic -> x-api-key, else Bearer
lib/schema/providers.ts    seeds 'savant' and 'commandcode' only
data/gateway.db            markup 3000 bps, 44 rows: 11 free, 23 priced, 10 plan
apixoai.online/pricing     12 published rows, e.g. deepseek-v4.1-flash $0.04/1M
commandcode.ai/pricing     Go $1, GOAT $10, Max $100, Provider $15 + pass-through
```

## Impact Assessment

### Affected Components

- `lib/business-model.ts` (new, pure)
- `scripts/business-model.mjs` (new), `package.json` (`business-model` script)
- `docs/business-model.md` (new), `docs/data/provider-prices.json` (new)
- `lib/providers/auth-headers.ts` (new), `lib/providers/request.ts`
- `lib/schema/providers.ts` (Apixo seed), `.env.example`
- `tests/business-model.test.mjs` (new), `tests/providers.test.mjs`

### Risk Level

- [x] Medium: the auth-header change touches every upstream request, and the
      document makes price claims that must match the database.

## Proposed Solution

### Approach

Pure functions compute catalog economics, free-pool exposure, and the sourcing
pivot; the script only reads the database, formats money, and rewrites the block
between two markers so prose stays hand-written. Gross margin is reported on
revenue (`(sell - cost) / sell`), because that is the money available to carry
the free tier; markup on cost would overstate it.

### Steps

1. `lib/business-model.ts` with `catalogEconomics`, `freePoolEconomics`,
   `providerPivot`. — implemented
2. `scripts/business-model.mjs`, `npm run business-model`. — implemented
3. `docs/business-model.md` prose plus markers; generated report inside. —
   implemented
4. Dated snapshot of Apixo and CommandCode published prices. — implemented
5. Apixo provider seed, disabled, `APIXO_API_KEY`, sort order 30. — implemented
6. Dual-format auth headers extracted and tested. — implemented

### Verification

- `npm test` — 152 tests pass, including 7 new economics tests and 2 auth-header
  tests.
- `npm run lint`, `npm run typecheck`, `npm run build` clean.
- `npm run business-model` writes the block; the provider table lists three
  providers after the schema migration seeded `apixo`.
- `GET /admin/providers` with a signed session returns 200 and contains the
  Apixo label, its base URL, and `APIXO_API_KEY`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/business-model.test.mjs
- gate: test
- gate: build

### Verification Receipt

```text
npm test                   152 tests, 152 pass
npm run lint               0 errors, 0 warnings
npm run typecheck          pass
npm run build              pass
npm run business-model     wrote docs/business-model.md
/admin/providers           200, contains Apixo + APIXO_API_KEY + api.apixoai.online
median free-allowance cost $81.00/month; revenue needed $350/month at 23.2% margin
```

## Perfection Loop

### Loop 1 — RED

- **RED:** No documented provider economics; a third upstream with no
  registration path; a dual-format provider could only authenticate one route.
- **GREEN:** Generated document, dated snapshot, seeded provider row, shared
  auth headers.
- **AUDIT:** The document cannot drift, because every figure is generated from
  the database; the only hand-written numbers are the dated published rates,
  which name their source.
- **ADVERSARIAL:** A near-miss id (`claude-fable-5` vs `claude-fable-5.1`) must
  not be treated as a match. The pivot table compares only exact upstream ids
  and the document states how many rows matched.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should the free allowance be priced at the cheapest row? → No; three points
   (cheapest, median, priciest) are shown because the real number depends on
   which models customers choose.
2. Is Apixo's missing balance endpoint a problem? → It removes automated
   exhaustion detection, so `supports_balance` stays 0 and the operator checks
   the dashboard. Recorded in the document.
3. Does seeding a disabled provider change routing? → No. Admission resolves a
   provider per model, and an Apixo model cannot exist until a catalog sync
   runs with a key.
4. Do extra headers break OpenAI-only upstreams? → They are only added for
   `kind: "both"`; single-format providers still send one credential.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/business-model.ts:1-260`,
      `scripts/business-model.mjs:1-300`, `docs/business-model.md:1-170`,
      `lib/providers/auth-headers.ts:1-30`,
      `lib/schema/providers.ts:140-165`
- [x] Gate output — above
- [x] Reproducibility — `npm run business-model`; `npm test`
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Provider prices, catalog economics, free-allowance
  exposure, and the Apixo pivot are documented and regenerable; Apixo is
  registered disabled; dual-format upstreams authenticate both routes.
- **Tests Added:** Yes — `tests/business-model.test.mjs` (7),
  `tests/providers.test.mjs` (+2).
- **Verification Evidence:** Gate receipt above.
- **Archived:** pending

## Lessons Learned

A price document that is typed by hand is wrong the first time a sync runs.
Generating the numbers from the same database the gateway bills from is the only
version that stays true, and it forces the assumptions (markup, allocation
share, which rows are priced) to be explicit.
