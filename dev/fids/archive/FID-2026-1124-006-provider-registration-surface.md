# FID: Provider registration surface cannot express what a provider needs

**Filename:** `FID-2026-1124-006-provider-registration-surface.md`
**ID:** FID-2026-1124-006
**Severity:** medium
**Status:** closed
**Created:** 2026-11-25 00:25
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The operator console is the only sanctioned way to register a provider, and it
cannot express three facts that the registry and the gateway already act on:

1. Every new provider is created **claiming** balance, subscription and pricing
   support, because `EMPTY_PROVIDER` sets all three to `true`. For an ordinary
   OpenAI-compatible reseller that is three claims it cannot honour, so the first
   sync and the first runtime check fail on endpoints that were never there.
2. `requiresModelReview` exists in `ProviderRecord`, in the schema, in the route
   election and in the review gate — but not in `ProviderInput`, the REST
   handler or the form. Only the two seed rows can ever set it.
3. `defaultHeaders` is accepted by the API and preserved on edit, but has no
   field in the console, so it cannot be inspected or corrected there.

A fourth, smaller issue: `deleteProvider` checks the default flag outside its
transaction and leaves an orphan `provider_sync_leases` row behind.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `f2e1a53` on `main`, clean tree

## Detailed Description

### Problem

**D1 — optimistic capability defaults** (`components/admin/provider-form.tsx:24-36`):

```ts
export const EMPTY_PROVIDER: ProviderDraft = {
  ...
  balance: true,
  subscription: true,
  pricing: true,
```

The registry stores those as `supports_balance`, `supports_subscription` and
`supports_pricing`, and the schema defaults them to absent
(`lib/storage/schema/catalog.ts:25`, `supports_subscription INTEGER NOT NULL
DEFAULT 0`). The form therefore overrides a conservative database default with an
optimistic one. Consequences: a subscription fetch against an endpoint that does
not exist, a balance fetch against `/balance` that 404s, and — until
`FID-2026-1124-003` lands — a permanent `quota_error` on the row.

**D2 — the review gate is unreachable.** `requiresModelReview` is read by
`lib/storage/store/routes.ts:59` (`p.requires_model_review`), by
`model-status.ts:52` (an enable is refused for an undecided row) and by
`model-sql.ts:33`, and it is stored at `lib/storage/schema/catalog.ts:27`. It is
*not* in `ProviderInput` (`lib/providers/registry.ts:8-23`), so
`readProviderInput` cannot produce it and no route can set it. `grep -rn
requiresModelReview lib/providers` returns exactly one hit, `types.ts:21`. Only
`lib/storage/schema/catalog-seeds.ts:201,225` ever writes it. An operator
onboarding a provider whose terms require per-model approval — the exact reason
the gate exists — has no console path to enable it.

**D3 — headers are write-only through the API.** `defaultHeaders` is part of
`ProviderInput` (`registry.ts:14`), validated (`registry.ts:43`), persisted
(`registry.ts:220`) and used on every request
(`lib/providers/request.ts:38`). `ProviderForm` carries it in its draft
(`provider-form.tsx:15,30,46,63`) but renders no control for it, so on edit it is
displayed nowhere: an operator cannot confirm which headers a provider is
actually sending, and cannot add one after creation without calling the API.

**D4 — delete hygiene** (`lib/storage/store/providers.ts:295-316`):

```ts
if (slug === (await getDefaultProviderSlug(db))) return false;

const removed = await db.transaction(async () => { ... })
```

The default check reads outside the transaction, so a concurrent
`setDefaultProvider` can flag the row being deleted (and under
`FID-2026-1124-004` that is now a re-key, not just a column write).
`provider_sync_leases` (`schema/catalog.ts:114-119`) declares `slug TEXT PRIMARY
KEY` with no reference to `providers`, and `deleteProvider` does not remove it,
so re-registering a slug can inherit a lease row.

### Expected Behavior

A provider row should start as what the operator declared and nothing more; every
column the gateway acts on should be settable and visible in the console; and a
delete should leave no row naming the slug.

### Root Cause

The form was written against the first provider (which genuinely has balance,
subscription and pricing) and grew the registry around it: capabilities were
added to `ProviderRecord` and the schema without being added to the input
contract, and the header map was added to the API without a form control.

### Evidence

```text
components/admin/provider-form.tsx:33-35   balance: true / subscription: true / pricing: true
lib/storage/schema/catalog.ts:25           supports_subscription INTEGER NOT NULL DEFAULT 0
lib/providers/registry.ts:8-23             ProviderInput: no requiresModelReview field
lib/storage/store/model-status.ts:69       if (Number(row.requires_model_review) === 1) {
lib/storage/schema/catalog-seeds.ts:201    requires_model_review, enabled, sort_order, ...
components/admin/provider-form.tsx:15,63   defaultHeaders carried, never rendered
lib/storage/schema/catalog.ts:114-119      provider_sync_leases: no REFERENCES providers(slug)
lib/storage/store/providers.ts:296         default check before db.transaction
```

## Impact Assessment

### Affected Components

- `components/admin/provider-form.tsx`
- `lib/providers/registry.ts` (`ProviderInput`, `readProviderInput`)
- `app/api/admin/providers/route.ts`, `app/api/admin/providers/[slug]/route.ts`
- `components/admin/providers-panel.tsx`
- `lib/storage/store/providers.ts` (`createProvider`, `updateProvider`, `deleteProvider`)
- `docs/providers.md`

### Risk Level

- [x] Medium: no money path changes; the operator-visible consequence is a
      provider that appears configured but fails its checks, and a safety gate
      that cannot be switched on for a new provider.

## Proposed Solution

### Approach

Make the console able to state every fact the gateway acts on, and make a new row
start from the conservative default the schema already chose.

### Steps

1. **Conservative defaults.** Change `EMPTY_PROVIDER` to
   `balance: false, subscription: false, pricing: false`. The form text states the
   consequence of leaving them off: no runtime probe, no quota admission ceiling
   from the upstream (an `unknown_ceiling` refusal unless `PROVIDER_SHARED_RPM` is
   set), and cost stays `unknown` so imported rows arrive disabled.
2. **Capability descriptions.** Label each checkbox with what it enables rather
   than what it is called: "Balance endpoint (polls `<balanceUrl>` for balance and
   RPM)", "Subscription endpoint (polls quota; enables quota admission)",
   "Published pricing (syncs upstream cost into the price table)".
3. **Expose the review gate.** Add `requiresModelReview: boolean` to
   `ProviderInput`, parse it in `readProviderInput`, persist it in
   `createProvider`/`updateProvider`, accept it in both admin handlers, and render
   it as a checkbox with its consequence: every imported row stays unpublished
   until it carries a dated decision.
4. **Editable headers.** Render `defaultHeaders` as an ordered key/value editor
   with add/remove, validating names against the same rule the API applies, and
   show the effective set read-only on the row summary. Reuse
   `parseDefaultHeaders` (`registry.ts:43`) rather than a second validator.
5. **Delete hygiene.** Move the default check inside the transaction and re-read
   the flag there, and delete `provider_sync_leases` for the slug in the same
   transaction.
6. **Document it.** `docs/providers.md` gains the three capability meanings and
   says that the review gate is a per-provider declaration.

### Non-goals

- No change to how capabilities are *enforced*. This FID only makes them
  declarable and visible.
- No preset system ("InferHub preset"). One honest checkbox set is enough.
- No header secrets: `defaultHeaders` stays a plain map; credentials remain
  environment variables and never appear in it.

### Verification

- `tests/provider-input.test.mjs`: `readProviderInput` round-trips
  `requiresModelReview` and rejects a non-boolean; `defaultHeaders` keeps its
  existing validation messages.
- `tests/provider-delete-postgres.test.mjs`: deleting a provider removes its
  `provider_sync_leases` row; deleting the current default is refused with the
  row named; a provider made non-default and then deleted succeeds.
- A live probe: register a provider through the console with all three
  capabilities off and confirm the row reports them off, no probe fires, and
  enabling the review gate keeps its imported rows undecided.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/providers.test.mjs (input contract)
- gate: test tests/store-providers-postgres.test.mjs (create, update, delete, lease hygiene)
- gate: test tests/provider-enable-sync.test.mjs
- gate: quality
- gate: build

### Verification Receipt

`npm run verify` PASS 12/12 gates in 179.5 s: 1289/1289 tests, 0 skipped, PostgreSQL 20/20, quality 719 files, build PASS, both HTTP suites, recovery 15/15, finished 2026-11-25 and recorded in `.verify/summary.json`. `tsc --noEmit` exit 0; `eslint --max-warnings=0` on the changed files exit 0; the six affected suites are 48/48. The live console probe in §Verification was not performed: no browser exercise is claimed.

## Perfection Loop

### Loop 1 — RED

- **RED:** three facts the gateway acts on are unreachable from the only
  sanctioned registration surface, and one of them (`requiresModelReview`) is a
  safety gate. Evidence is the `grep` result showing a single hit outside
  `lib/storage`.
- **GREEN:** steps 1-6.
- **AUDIT:** each claim is a quoted line; the `requiresModelReview` claim rests on
  an absence, so the exact search is recorded in §Evidence and the negative is
  reproducible.
- **ADVERSARIAL:** the strongest objection is that D1 is a preference, not a
  defect, and that defaulting capabilities off makes the common case (an
  OpenAI-compatible provider with `/balance`) more work. Answer: the seed rows
  already carry their flags, so no existing provider changes; a new row that
  claims a capability it lacks produces a *failed check* the operator must then
  diagnose, which is more work than one unchecked box.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Should `pricing` default on, since cost is read from `/v1/models` anyway?**
   No: pricing support means the upstream publishes per-token prices the sync can
   trust. Guessing it on is how a model gets a $0.00 cost and a published sell
   price of zero.
2. **Does exposing `requiresModelReview` risk leaving a catalog empty?** Yes, by
   design — that is what the gate is for. Step 3 states the consequence in the
   form so it is not a surprise, and the bulk decision panel
   (`FID-2026-1122-007`) already exists for the bulk case.
3. **Are headers safe to edit in a browser?** They must never carry credentials.
   Step 4 validates names, and `docs/providers.md` already says the key lives in
   `.env.local`; adding a value that looks like a secret is refused by the same
   rule that refuses pasted keys.

### Loop 2 — Independent audit and self-correction

- **RED:** the first draft of this record claimed `provider_catalog_groups` rows
  are orphaned by a delete, and that the catalog preview passes a hardcoded
  default slug. Both re-read as false: `schema/catalog.ts:252` declares
  `REFERENCES providers(slug) ON DELETE CASCADE`, and
  `app/api/admin/providers/[slug]/preview/route.ts:30` passes
  `await getDefaultProviderSlug()`. Both claims were withdrawn rather than
  softened.
- **GREEN:** D4 is now scoped to the lease table and the default-check race, which
  are real.
- **AUDIT:** `provider_sync_leases` has no `REFERENCES` clause in its `CREATE
  TABLE` (`schema/catalog.ts:114-119`), which is the difference from
  `provider_catalog_groups` and the reason only one of the two is a finding.
- **ADVERSARIAL:** "the default-check race is theoretical." It is, and it is
  listed last for that reason — but under `FID-2026-1124-004` the check now
  gates a re-key, so moving it inside the transaction costs nothing and removes
  the question.
- **CHANGE DELTA:** ~15% — two findings removed.

### Loop 3 — Final convergence

- **RED:** residual risk that step 1's conservative default hides a provider's
  true capability and an operator never notices.
- **GREEN:** the row summary shows each capability as on/off beside the health
  column, so "off" is visible rather than implicit; the sync warning already
  reports when pricing was not imported.
- **AUDIT:** `components/admin/providers-panel.tsx` renders the status/health
  columns already; step 1 adds no new data source, only a display of existing
  flags.
- **ADVERSARIAL:** "why not infer capabilities from `kind`?" Because `kind`
  describes the wire protocol, not the account's plan; conflating them is the
  error this FID is fixing.
- **CHANGE DELTA:** <2% — converged.

## Resolution

- **Closed Date:** 2026-11-25
- **Fix Description:** `EMPTY_PROVIDER` now starts every capability unchecked, so
  a new row no longer claims balance, quota or published pricing the operator
  never declared; each checkbox states what it enables, and the form says what
  leaving them off costs (no probe, no observed RPM, cost unknown and imported
  rows disabled). `requiresModelReview` is now part of `ProviderInput`, parsed
  strictly and persisted by `createProvider` and `updateProvider`, so the review
  gate is settable from the console for any provider instead of only the seeds;
  the form renders it with its consequence, and the row summary shows each
  capability on/off plus the effective header set. `defaultHeaders` gained an
  ordered key/value editor that reuses the API's own validator on submit. A
  delete now re-reads the default flag inside its transaction and removes the
  slug's `provider_sync_leases` row, because that table declares no foreign key
  and a re-registered slug would otherwise inherit a live lease.
- **Tests Added:** one input case (`requiresModelReview` round-trips, defaults
  false, refuses a non-boolean) and one store case (the gate is recorded on
  create and update; deleting a provider leaves no lease row), with the existing
  default and enable-sync proofs re-run.
- **Verification Evidence:** `npm run verify` PASS 12/12 gates, 1289/1289 tests,
  PostgreSQL 20/20, 179.5 s; focused typecheck, `eslint --max-warnings=0` and the
  six affected suites 48/48 all exit 0. No live console probe or browser
  exercise is claimed.
- **Commit SHA:** `b9256da` (`feat(providers): let the console declare what a
  provider actually supports (FID-2026-1124-006)`).
- **Archived:** 2026-11-25 → `dev/fids/archive/`

## Lessons Learned

When a column is added to a table and acted on by the gateway, it must be added
to the input contract and the operator surface in the same change — otherwise the
only writers are seeds and the gate becomes decorative. A form default that
overrides a conservative schema default is a capability claim the operator never
made.
