# FID-2026-1122-005 — Provider key operability and sync on enable

**Filename:** `FID-2026-1122-005-provider-key-operability.md`
**ID:** FID-2026-1122-005
**Severity:** medium
**Status:** converged
**Priority:** high
**Created:** 2026-11-22 24:40 EST
**Updated:** 2026-11-22 24:40 EST
**Automation Level:** 3
**Risk Level:** medium
**Review Required:** No
**Commit State:** `94b2e87`
**Branch:** `main`

## Operator Report

> "I loaded the site, for some reason I'm having an issue adding my key for
> InferHub — when I add the key it never sticks."

## Problem Statement

The admin provider surface accepts only an environment variable **name**; the
secret lives in `.env.local`. Nothing on the page says that in words an operator
reads while holding a key in the clipboard, and nothing detects that a pasted
value is the secret itself. Reproduced against the running dev server
(`.scratch/probe-admin-key.mjs`, admin session, local PGlite):

| Sent | Answer | Operator experience |
| --- | --- | --- |
| `keyEnvVar: "sk-not-a-variable-name"` | `400 keyEnvVar must be an upper-snake-case environment variable name.` | "It never sticks." The message names the rule, not the mistake, and does not say where the value belongs. |
| `enabled: true` with the variable set | `200`, row `active` | Works — but only because the value was already in `.env.local`. |
| `enabled: true`, variable unset | `409 Cannot enable … is not set in this runtime.` | Accurate, and the only place the runtime explains itself. |

Two defects follow, and one missing automation:

1. **The field's purpose is unstated.** Row-after-row it reads "Key environment
   variable", the table says only "Secrets are never stored here", and the
   missing-key hint says "add it before enabling" without naming the file, the
   variable, or the restart. An operator pasting a key into the only key-shaped
   field on the page is behaving reasonably.
2. **A pasted secret is rejected by a rule, not by name.** The one message that
   would have stopped the confusion is absent.
3. **Nothing syncs when a provider is enabled.** The operator enables InferHub,
   sees `0` models, and the catalog only appears at the next cron tick, the next
   page render past the due interval, or after finding the **Sync** button. The
   first thing they conclude is that the key did not take.

## Goals

- An operator who pastes a key where a variable name belongs is told, in one
  sentence, what the field takes and where the value goes.
- The page states where the value lives and what change makes this runtime see
  it, in the row that shows `missing key`.
- Enabling a provider, or saving one whose connection settings changed, reads
  that provider's catalog once, immediately, without a second click.
- A sync failure never fails the save that requested it.

## Non-Goals

- No secret is stored in the database, returned to the browser, or logged. The
  registry continues to hold only the variable name (AGENTS.md Non-Negotiable 2).
- No in-browser key entry that writes `.env.local`; a serverless deployment has
  no writable file and the control would be a lie there.
- No change to the freshness clock, the lease, or the cron contract.
- No change to routing, pricing or admission.

## Affected Components

- `lib/providers/registry.ts` — `readProviderInput` key-name validation (`:167`).
- `lib/providers/enable-sync.ts` — new pure decision helper.
- `app/api/admin/providers/route.ts` — create path syncs when enabled+configured.
- `app/api/admin/providers/[slug]/route.ts` — patch path syncs on the same rule.
- `components/admin/provider-form.tsx` — field label and hint.
- `components/admin/providers-panel.tsx` — missing-key hint and the sync notice.
- `docs/providers.md`, `docs/provider-scheduler.md`, `CHANGELOG.md`, `SCOPE.md`.

## Proposed Solution

1. **Name the mistake.** In `readProviderInput`, before the shape rule, detect a
   secret-shaped value — 20 or more characters, not upper-snake-case, and either
   lower-case or containing `-` — and return: "That looks like the key value
   itself. This field takes the variable name, for example
   `INFERHUB_API_KEY`; put the value in `.env.local` and restart the runtime."
   The shape rule stays for every other invalid name.
2. **Say where the value lives.** The form field becomes "Key environment
   variable name (not the key)" with a hint under it naming `.env.local` and the
   restart. The providers table's missing-key line becomes "set
   `<VAR>` in `.env.local`, then restart" using the row's own variable name.
3. **Sync on the save that changes the connection.** New pure helper
   `syncAfterSave({ before, after, configured })` returning true when the save
   leaves the provider enabled and this runtime sees its key **and** either the
   provider was not enabled before, or one of `keyEnvVar`, `baseUrl`,
   `catalogUrl`, `balanceUrl`, `defaultHeaders` changed. Re-saving an unrelated
   field does not touch the network.
4. **Report it inline.** Both admin routes call `syncProvider(slug)` when the
   helper says so, add `sync` (imported/refused/warnings) to the response, and
   convert a thrown sync into `syncError` rather than a failed save. The panel
   renders "Enabled InferHub: 255 models imported, 241 refused." on success and
   the sync error, unmodified, on failure.
5. **Docs.** `docs/providers.md`: the key is a variable name and enabling reads
   the catalog once. `docs/provider-scheduler.md`: the enable-time read is not a
   scheduler and does not change the due clock.

## Risks & Mitigations

- **A slow vendor in a request path.** The same call already exists behind the
  **Sync** button, and the admin session is required; the response carries the
  per-provider warnings. A 520-model read is seconds, not a timeout, and a
  serverless body limit does not apply to the response shape used here.
- **A key-name change silently syncing with a stale key.** The helper only
  syncs when this runtime reports the named variable as present.
- **Message duplication.** The paste detection lives in one place and the hint
  text is the same sentence in the form and the table, so they cannot drift into
  contradiction.

## Verification Plan

| Gate | Command | Expectation |
| --- | --- | --- |
| Unit | `node --test tests/provider-enable-sync.test.mjs tests/providers.test.mjs` | decision table and both messages |
| Regression | `node --test tests/provider-readiness.test.mjs tests/provider-inferhub-sync.test.mjs` | unchanged readiness semantics |
| Lint | `npm run lint` | zero warnings |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run verify` | 12/12 gates |

## Acceptance Criteria

1. Pasting a key into the variable field returns the "That looks like the key
   value itself" message, verified by a test.
2. Both surfaces name `.env.local` and the restart where a key is missing.
3. `syncAfterSave` returns false for an unrelated save and true for enable and
   for a changed connection field, verified by the decision table.
4. A sync failure returns `ok: true` with `syncError`, and the row keeps the
   config. Verified at the storage level with a throwing dep.
5. `npm run verify` passes with zero skipped tests.

## Step Ledger

| # | Step | Status |
| --- | --- | --- |
| 1 | Paste detection in `readProviderInput` | planned |
| 2 | `syncAfterSave` helper | planned |
| 3 | Create and patch routes sync on the rule | planned |
| 4 | Form and table copy naming `.env.local` | planned |
| 5 | Notice renders the sync result | planned |
| 6 | Tests: decision table, both messages, failure path | planned |
| 7 | Docs, CHANGELOG, SCOPE | planned |

## Loop 1 — RED / GREEN / AUDIT / ADVERSARIAL

- **RED:** The operator's report is one sentence; the reproduction above turns it
  into three named defects with the exact responses that produce each. Nothing
  was accepted as "user error" without a message that would have helped him.
- **GREEN:** Five changes, each at a named line range, no schema change.
- **AUDIT:** `grep -rn "Key environment variable" components` returns the two
  surfaces this record edits and no others; `grep -rn "syncAfterSave" lib`
  returns the helper and its two callers after the change.
- **ADVERSARIAL:** "Does enabling a provider now run upstream reads during a
  request an attacker can trigger?" Only an authenticated admin PATCH does, and
  only for a provider whose key this runtime already holds.
- **CHANGE DELTA:** 0% — first convergence pass.

## Resolution

- **Closed Date:** (filled at closure)
- **Fix Description:** (filled at closure)
- **Tests Added:** (filled at closure)
- **Verification Evidence:** (filled at closure)
- **Archived:** (filled at closure)
