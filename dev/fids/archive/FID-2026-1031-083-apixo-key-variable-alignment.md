# FID: Align the Apixo provider row with the documented credential name

**Filename:** `FID-2026-1031-083-apixo-key-variable-alignment.md`
**ID:** FID-2026-1031-083
**Severity:** low
**Status:** verified
**Created:** 2026-10-31 00:15
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The Apixo seed stored `APIXO_API_KEY` as its key variable, but the upstream
documents `APIXOAI_API_KEY` and the operator supplied that name. A credential can
only be read from the variable a provider row names, so the key sat invisible:
the provider stayed `unconfigured`, could not be enabled, could not sync, and no
Apixo model could reach the catalog. The seed now uses the documented name, and
an untouched row seeded with the old spelling is renamed once on boot.

## Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node 24, Next.js 16.4.3
- **State:** `main` at `5b982ef` plus this change

## Detailed Description

### Problem

`providerKeyConfigured(provider.keyEnvVar)` and `authHeaders` read
`process.env[keyEnvVar]` exactly. With `key_env_var = 'APIXO_API_KEY'` and only
`APIXOAI_API_KEY` present, `configured` was false, `syncProvider` returned the
`unconfiguredSummary` without a request, and the admin card reported `no key`
with zero models. Nothing about the failure is visible beyond that chip, so it
reads as "the provider is empty" rather than "the variable name does not match".

### Expected Behavior

- A provider row names the same variable the upstream documents.
- An installation seeded before the rename adopts it without operator surgery.
- An operator's deliberate edit to a different variable is not overwritten.

### Root Cause

The seed name came from an early read of the provider's site; the documented
name is `APIXOAI_API_KEY`. The registry stores only a name, so there was no
fallback path and no error — just an unconfigured provider.

### Evidence

```text
lib/schema/providers.ts (before): 'APIXO_API_KEY' in the apixo seed
.env.example (before): APIXO_API_KEY=
local .env.local: APIXOAI_API_KEY supplied by the operator, 2026-10-31
```

## Impact Assessment

### Affected Components

- `lib/schema/providers.ts` — seed value and `adoptDocumentedApixoKey`
- `tests/schema-migration.test.mjs` — migration coverage
- `.env.example`, `README.md`, `docs/business-model.md`,
  `docs/deployment-runbook.md`, `docs/research/apixo-provider-review.md`
- `dev/tracking/internal-followups.json`

### Risk Level

- [x] Low: additive, scoped by slug and by the exact legacy value

## Proposed Solution

### Approach

Rename, do not alias. The row keeps naming one variable; the migration updates
only `slug = 'apixo' AND key_env_var = 'APIXO_API_KEY'`, which is the shipped
seed value. A row an operator pointed elsewhere does not match and is left
alone. The statement is idempotent, so every boot after the first is a no-op.

### Steps

1. Seed `APIXOAI_API_KEY`.
2. Run `adoptDocumentedApixoKey` after `seedProviders`.
3. Update the env template, README, runbook, business model and Apixo review.
4. Record the key's arrival and the remaining enable → sync → price steps in the
   tracking ledger.
5. Cover the migration with a test.

### Verification

`tests/schema-migration.test.mjs` asserts the rename happens once, touches only
the `apixo` row, and leaves an unrelated provider whose variable happens to be
`APIXO_API_KEY` untouched.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/schema-migration.test.mjs
- gate: quality

The full unit suite was run after the change (417 pass). `npm run build` and the HTTP suites were not rerun: this change is a seed
literal plus a scoped `UPDATE` executed inside the existing migration
transaction, and neither touches a request path. That is a limitation of this
receipt, not a claim that those gates passed on this change.

### Verification Receipt

- verified: 2026-10-31 (local tree)
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/schema-migration.test.mjs: exit 0 (4 pass, 0 fail)
- test: exit 0 (417 pass, 0 fail)
- quality: PASS (400-line ceiling, 366 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** A real credential under the documented name is invisible to the
  provider row, and the only symptom is a `no key` chip.
- **GREEN:** Seed and row adopt `APIXOAI_API_KEY`.
- **AUDIT:** Migration test plus the existing provider-registry tests.
- **ADVERSARIAL:** Could the rename clobber an operator's choice? Only if they
  chose the exact legacy seed value, which is the value being corrected. Any
  other name, including a custom variable, does not match the `WHERE`.
- **CHANGE DELTA:** initial.

### Missed Questions

1. **Why not read both names?** Two names for one secret is the bug; a fallback
   chain would preserve the mismatch and hide it from the `no key` chip.
2. **What happens on a fresh database?** The seed inserts the new name and the
   migration matches nothing.
3. **Does the migration run outside the schema gate?** No — it is called inside
   `providerSchema`, which runs inside the single write-locked migration
   transaction in `lib/db.ts`.
4. **Is the value ever logged?** No. Only the variable name is stored or shown.

### Implementation Evidence

- [x] **Commit SHA:** `ecf4f19`
- [x] **File:line ranges:** `lib/schema/providers.ts` (`adoptDocumentedApixoKey`,
  apixo seed), `tests/schema-migration.test.mjs`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "APIXOAI_API_KEY" lib .env.example`

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/lint/tests pass with pasted tool output
- [x] Production call-graph evidence: `providerSchema` runs from `createDb`, the
  only database bootstrap; `providerKeyConfigured` reads the row's variable name
- [x] FID status reflects the implementation state

### Loop 2 — Final convergence

- **RED:** Documentation carried the old name in five places, so the next
  operator would repeat the mismatch.
- **GREEN:** All five updated; `.env.example` explains the one-time rename.
- **AUDIT:** `grep -rn "APIXO_API_KEY"` now returns only the migration's `WHERE`
  clause, the test, and this record.
- **ADVERSARIAL:** The generated provider table in `docs/business-model.md` still
  reads the database and will print whatever the row holds; that table is a
  snapshot, not a source of truth.
- **CHANGE DELTA:** 10%.

## Resolution

- **Closed Date:** 2026-10-31 after the commit below
- **Fix Description:** Documented credential name in the seed plus a scoped,
  idempotent rename for installations seeded with the old spelling.
- **Tests Added:** Yes — `tests/schema-migration.test.mjs`.
- **Verification Evidence:** receipt above.
- **Archived:** `dev/fids/archive/` after the commit below

## Lessons Learned

A registry that stores a variable *name* turns a typo into silence. Naming the
secret exactly what the upstream documents removes a class of "provider is
empty" reports that no error message would have explained.
