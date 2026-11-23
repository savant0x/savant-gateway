# FID-2026-1122-005 — Provider key operability and sync on enable

**Filename:** `FID-2026-1122-005-provider-key-operability.md`
**ID:** FID-2026-1122-005
**Severity:** medium
**Status:** closed
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
| 1 | Paste detection in `readProviderInput` | implemented |
| 2 | `syncAfterSave` helper | implemented |
| 3 | Create and patch routes sync on the rule | implemented |
| 4 | Form and table copy naming `.env.local` | implemented |
| 5 | Notice renders the sync result | implemented |
| 6 | Tests: decision table, both messages, failure path | implemented |
| 7 | Docs, CHANGELOG, SCOPE | implemented |

### Verification Receipt

- verified: 2026-11-22T24:55:00Z
- `npm run verify`: **PASS**, 12/12 gates, 173.7s
- test: exit 0 — **1240/1240 pass, 0 skipped**
- test:postgres: exit 0 — 20/20
- quality: exit 0 (704 files)
- repository:check: exit 0 (13 active FIDs)
- build, test:http, test:recovery, test:visual-builds-browser, deployment:receipt: exit 0
- summary: `.verify/summary.json`

### Implementation Evidence

- [x] **Commit SHA:** `ce6cad7` (`fix(admin): name the key field's purpose and sync on
  enable`), pushed to `main`; pre-push gates passed.
- [x] **File:line ranges:** `lib/providers/registry.ts:128-146` (message) and `:190` (call site);
  `lib/providers/enable-sync.ts:1-52` (decision); `app/api/admin/providers/[slug]/route.ts:57,68-79`;
  `app/api/admin/providers/route.ts:66,79-97`; `components/admin/provider-form.tsx` (label, hint);
  `components/admin/providers-panel.tsx:100,135,144-158` (notice), table hint and card copy.
- [x] **Live verification** (dev runtime, admin session, `.scratch/probe-enable-sync.mjs`):
  pasted key → `400` naming the mistake; disable → no sync; enable → `200` with
  `imported: 277` and the 245 alias / 14 media refusals; unreachable base URL → `200`, `ok: true`,
  `syncError: "The catalog could not be read; the configuration was saved. Retry with Sync."` and the
  row kept the saved configuration; restoring the address re-read 277.
- [x] **Reproducibility:** `grep -rn "syncAfterSave" lib app` returns the helper and both call sites;
  `grep -rn keyEnvVarError lib` returns the message and its one caller.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist and carry the change.
- [x] Implementation matches the Proposed Solution step by step.
- [x] Lint (zero warnings), typecheck and tests pass with the pasted output above.
- [x] Production call-graph evidence: admin `PATCH` → `updateProvider` → `syncAfterSave` →
  `syncProvider` → `fetchProviderUrl` → catalog import; the notice reads the response's `sync`.
- [x] FID status reflects the implementation state.

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

## Loop 2 — Independent audit and self-correction

- **RED:** The first `npm run verify` after implementation **FAILED** `repository:check` twice in a
  row, and both failures were mine: the record had no `**ID:**` metadata line, and
  `dev/fids/README.md` did not register the FID. A third defect came from reading the live output
  rather than the code: a failed sync returned `syncError: "Sync failed"`, which tells the operator
  nothing to do. `sanitizeError` is right to withhold exception text — an upstream can echo the
  credential — but the fixed message it substitutes has to carry the next step.
- **GREEN:** Added the ID and filename metadata; registered the FID row with the new counts; both
  routes now pass "The catalog could not be read; the configuration was saved. Retry with Sync."
  (create path: "the provider was saved").
- **AUDIT:** `npm run repository:check` PASS with 13 active FIDs; `npm run verify` PASS, 12/12,
  1240/1240 with 0 skipped; the live probe reprinted the new message verbatim.
- **ADVERSARIAL:** "Does the save now hide a broken key?" No: the paste message fires before any
  write, the enable refusal still names the missing variable, and the row keeps reporting whether
  this runtime sees the key.
- **CHANGE DELTA:** ~15% of the record text (two gate failures, one message change, this loop).

## Loop 3 — Final convergence

- **RED:** Residual limits, named: the sync runs inside the admin request, so a very slow vendor
  delays that response (the same call the **Sync** button already made); the decision helper treats
  a header set that only re-orders keys as unchanged, which is right for HTTP but means an
  operator who re-orders headers without changing them gets no read; and a provider enabled while
  this runtime lacks the key is refused, so the enable-time read can never be the first thing that
  discovers a missing secret.
- **GREEN:** No code change; the first is inherent to the operator action and documented in
  `docs/provider-scheduler.md`, the second is intentional, the third is the existing refusal.
- **AUDIT:** `docs/providers.md` and `docs/provider-scheduler.md` describe the behavior as built;
  no document claims a scheduler change.
- **ADVERSARIAL:** "Can a non-admin trigger an upstream read?" No: `guardAdminApi` runs first in both
  routes, before any body is read.
- **CHANGE DELTA:** 0% (documentation only).

## Resolution

- **Closed Date:** 2026-11-22 25:05
- **Fix Description:** A pasted key is refused with a message that names the mistake and where the
  value belongs; the form and the providers table state that the value lives in `.env.local` and
  that the runtime must be restarted; each row reports whether this runtime sees the key; and a save
  that makes a provider able to serve reads its catalog once in that request, reporting the imported
  count, while a failed read keeps the saved configuration and says what to do next.
- **Tests Added:** Yes — `tests/provider-enable-sync.test.mjs` (8 cases: enable, create, missing key,
  disabled, unrelated edit, address moves, header order, dropped URL) and the paste-detection case
  in `tests/providers.test.mjs` (24 tests in that file's suite pass).
- **Verification Evidence:** `npm run verify` PASS — 12/12 gates, 1240/1240 tests, 0 skipped; plus
  the live admin probe quoted above (`imported: 277` in the enable response).
- **Archived:** 2026-11-22 25:10 EST — implementation `ce6cad7`, pushed to `main`.

## Lessons Learned
The operator said "the key never sticks" and the code said "that field is not a key field". Both
were accurate, and the product was the thing that failed to say so. Two habits are worth keeping:
reproduce an operator report against the running server before theorising, and read the response
the operator actually receives — `syncError: "Sync failed"` passed every gate and still would have
left him stuck.
