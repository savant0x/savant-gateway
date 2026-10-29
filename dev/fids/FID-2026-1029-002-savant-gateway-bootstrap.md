# FID: Establish the Savant Gateway identity and repository scaffold

**Filename:** `FID-2026-1029-002-savant-gateway-bootstrap.md`
**ID:** FID-2026-1029-002
**Severity:** high
**Status:** verified
**Created:** 2026-10-29 01:31 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. This npm
project has no `protocol.config.yaml` gate registry, no `fid:verify` binary, and
no `validate:repository` script; the real gates are the npm commands recorded
below. `implemented` is used only as a step status. Status is `verified`, not
`closed`: the initial commit does not exist yet at authoring time. It will close
against that commit and move to `dev/fids/archive/`.

## Summary

The rebuilt gateway still carried the prior scaffold's product name, module
name, environment prefix, and two files over the repository's 400-line ceiling,
and it had no governance surface, tests, hooks, or CI. This FID renames the
product and code surface to Savant Gateway, splits the dashboard and store by
responsibility, adds the ECHO/FID scaffold and npm gates, and prepares the first
commit for `savant0x/savant-gateway`. Provider behavior, key format, the
free-pool rule, and metering are unchanged.

## Environment

- **OS:** Windows, `MINGW64_NT-10.0-26300` (Git Bash), 2026-10-29 01:31 EDT.
- **Language/Runtime:** Node `v24.21.0`; npm `12.2.1`.
- **Tool Versions:** `next 16.4.3`, `@heroui/react 3.2.7`,
  `better-sqlite3 13.0.3`, `typescript 5.9.3`.
- **Commit/State:** no Git repository at verification time. `.env.local` holds
  the operator's upstream key and was not read. `data/gateway.db` is local
  runtime state and is ignored.

## Detailed Description

### Problem

1. The product and code surface still named the prior scaffold:
   `package.json` and `package-lock.json` said `apinex-gateway`,
   `config/site.ts` said "APInex Gateway", `lib/apinex.ts` named the provider
   module, and the environment contract used `APINEX_BASE_URL` and
   `APINEX_PUBLIC_MODELS_URL`.
2. `components/dashboard.tsx` was 929 lines and `lib/store.ts` was 471 lines,
   both over the 400-line absolute ceiling used by the operator's core
   repository.
3. There was no AGENTS/ECHO/protocol contract, no FID or session template for
   this repository, no attribution guard, no tests, no pre-push hook, and no CI.
4. The prior audit's open findings remained: the Host-header development guard
   is spoofable, and the usage-row copy overclaimed what is recorded.

### Expected Behavior

A repository named `savant-gateway` whose product and code naming belong to
this project, with every authored file under 400 lines, a real test and quality
gate, enforced no-agent-attribution, and a documented ECHO/FID workflow. The
provider integration continues to work exactly as before.

### Root Cause

Two mechanisms: the rebuild preserved the inherited module and product names
because they were never in scope for the first pass, and the dashboard/store
were written as single files without the ceiling applied until the repository
was compared with the operator's core repository. The governance surface was
also absent because the first pass optimized for a runnable gateway, not for a
repository that other agents would later operate.

### Evidence

Naming references before the change:

```text
package.json:2            "name": "apinex-gateway"
config/site.ts:2          name: "APInex Gateway"
lib/apinex.ts             provider module
.env.example:5-6          APINEX_BASE_URL, APINEX_PUBLIC_MODELS_URL
```

File sizes before the split:

```text
929 components/dashboard.tsx
471 lib/store.ts
```

File sizes after the split (largest authored files):

```text
388 lib/provider.ts
331 lib/gateway.ts
245 components/dashboard/tester-card.tsx
201 components/dashboard/keys-card.tsx
143 lib/store/shared.ts
124 lib/db.ts
```

Gate evidence after the change:

```text
npm run quality  → quality: PASS (400-line ceiling, 40 files scanned)
npm test         → tests 6, pass 6, fail 0
npm run build    → exit 0, 9 routes
npm run verify   → verify_exit=0
```

## Impact Assessment

### Affected Components

- `package.json`, `package-lock.json` — package name.
- `config/site.ts`, `app/layout.tsx`, `components/navbar.tsx`,
  `components/dashboard/*` — product copy.
- `lib/provider.ts` (renamed from `lib/apinex.ts`), `lib/gateway.ts`,
  `app/api/provider/sync/route.ts` — import path.
- `.env.example`, `lib/provider.ts`, `lib/store/provider.ts` — environment
  variable names; existing upstream defaults are unchanged.
- `lib/store.ts` and `components/dashboard.tsx` — replaced by barrels over
  split modules.
- `lib/http.ts` — IPv6 loopback parsing corrected.
- New governance, test, hook, CI, and documentation paths.
- Data/migration: none. Existing SQLite rows remain readable; no schema change.

### Risk Level

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

The rename touches every production entry point and the environment contract,
so a missed import or variable would break provider sync or the gateway. The
full `npm run verify` gate and the route-level import checks below cover that
risk. Provider behavior itself is untouched.

## Proposed Solution

### Approach

Rename first, then split by existing responsibility rather than inventing new
abstractions: model queries, key queries, usage queries, provider status, and
overview aggregation move into `lib/store/*`, while dashboard sections move into
`components/dashboard/*` with the shared formatters and chips extracted. Keep
`lib/store.ts` and `components/dashboard.tsx` as thin barrels so production
imports do not churn. Add only the governance the operator's core repository
actually enforces: attribution guard, lint/typecheck/test/quality/build,
protocol config, FID/session records, hooks, and CI. Do not port the
savant-code monorepo tooling, which depends on Bun workspaces and scripts that
do not exist here.

Alternatives rejected:

- Keep the prior name: the operator explicitly ordered the rename.
- Set a higher ceiling or baseline the two files: the core repository's ceiling
  is absolute, and both files split cleanly along existing responsibilities.
- Copy the full savant-code ECHO/agent machinery: most of it encodes a
  multi-agent Bun monorepo. This repository is a single Next.js app; the
  adopted summary keeps the laws that apply.

### Steps

1. `implemented` — Rename package, site config, module, environment variables,
   and product copy to Savant Gateway.
2. `implemented` — Split `lib/store.ts` into `lib/store/{shared,models,keys,usage,provider,overview}.ts` with a barrel.
3. `implemented` — Split `components/dashboard.tsx` into
   `components/dashboard/{format,chips,hero,provider-card,quick-start-card,models-card,keys-card,tester-card,usage-card,index}.tsx` with a barrel.
4. `implemented` — Fix IPv6 loopback parsing in `lib/http.ts` without changing
   the documented Host-header limitation.
5. `implemented` — Add `scripts/quality-report.mjs`, `scripts/attribution-guard.mjs`,
   `protocol.config.yaml`, and the npm `test`, `quality`, `verify`, and
   `prepare` scripts.
6. `implemented` — Add AGENTS, ECHO, CHANGELOG, CONTRIBUTING, SECURITY,
   knowledge, dev records, and the session-summary template.
7. `implemented` — Add the commit-msg and pre-push hooks and both CI workflows.
8. `implemented` — Run `npm run verify`.
9. `blocked` — Create and push the initial commit to
   `savant0x/savant-gateway`; blocked until the repository is initialized.
10. `blocked` — Close and archive this FID with the commit SHA; blocked on step 9.

### Verification

- `tests/http.test.mjs` covers bearer and `x-api-key` extraction, precedence,
  absence, loopback hosts, IPv6 loopback, and lookalike host rejection.
- `npm run quality` scans `app`, `components`, `config`, and `lib` against the
  400-line ceiling.
- `npm run verify` chains lint, typecheck, tests, quality, and build.
- Manual call-graph checks: `app/v1/chat/completions/route.ts` imports
  `handleChatCompletions`; `app/api/provider/sync/route.ts` imports
  `syncProvider` from `@/lib/provider`; `app/page.tsx` imports `getOverview`
  and `Dashboard`.
- Not exercised here: a new live provider call after the rename. The provider
  module's exported behavior is unchanged and the historical live evidence is in
  `SCOPE.md`; a fresh call is recorded as a remaining verification gap.

## Verification Gates

The savant-code template names `fid:verify`, `quality:report`, `scope:check`,
`validate:repository`, `progression`, and `balance`. None exist here. The gates
actually run are:

- `npm run lint` → `eslint .`
- `npm run typecheck` → `tsc --noEmit`
- `npm test` → `node --test tests/http.test.mjs`
- `npm run quality` → `node scripts/quality-report.mjs`
- `npm run build` → `next build`
- `npm run verify` → all of the above

## Verification Receipt

Execution date: 2026-10-29, 01:29-01:31 EDT. Commands ran from the project root.

```text
$ npm test
✔ extractApiKey accepts a bearer token
✔ extractApiKey accepts x-api-key
✔ extractApiKey prefers a bearer token
✔ extractApiKey returns null without a key
✔ isLocalRequest accepts loopback hostnames
✔ isLocalRequest rejects non-loopback and lookalike hosts
ℹ tests 6
ℹ pass 6
ℹ fail 0
test_exit=0
```

```text
$ npm run quality
quality: PASS (400-line ceiling, 40 files scanned)
quality_exit=0
```

```text
$ npm run verify
npm run check && npm run test && npm run quality && npm run build
verify_exit=0
```

```text
$ npm run build
▲ Next.js 16.4.3 (Turbopack)
✓ Compiled successfully in 685ms
✓ Generating static pages using 11 workers (2/2) in 422ms

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/keys
├ ƒ /api/keys/[id]
├ ƒ /api/models
├ ƒ /api/provider/sync
├ ƒ /api/usage
├ ƒ /v1/chat/completions
└ ƒ /v1/models
build_exit=0
```

Missing: initial commit SHA, remote push receipt, live provider re-check after
the rename.

## Perfection Loop

This record was authored after the implementation, so it cannot claim
pre-implementation convergence. The loop below records the corrections that
actually happened; no document change-distance is invented.

### Loop 1 — RED

- **RED:** The first split compile failed with
  `'Input' is not defined` in `components/dashboard/tester-card.tsx`; ESLint
  reported 13 import-order/prettier warnings; `node --test tests/` tried to
  load the directory as a module; the IPv6 loopback branch was unreachable
  because `split(":")[0]` on `[::1]:3000` returns `[`.
- **GREEN:** Added the missing import, ran `eslint . --fix`, pointed the test
  script at the test file, and replaced the host split with an explicit
  hostname parser that strips bracketed IPv6.
- **AUDIT:** Re-ran `npm run check`, `npm test`, `npm run quality`, and
  `npm run build`; all exit 0.
- **ADVERSARIAL:** The Host-header guard remains spoofable; a remote client can
  still send `Host: localhost`. The split is a file move, not a behavior
  rewrite, but no live provider call was made after the rename.
- **CHANGE DELTA:** Baseline; no preceding FID document.

### Missed Questions

- **Ownership:** still one seeded `user_dev`; no sign-in. Documented limit.
- **Retries:** none; provider errors map to `502` or pass through `400/402/429`.
- **Concurrency:** SQLite WAL, `busy_timeout`, one Node process.
- **Migration:** none; the schema is unchanged and existing rows remain valid.
- **Failure handling:** usage-write failures are still swallowed; documented.
- **Observability:** no structured logs or metrics; documented.
- **Honest UI:** the usage copy now says "completed or attempted upstream call"
  instead of "every gateway request".
- **Security:** Host-header boundary is recorded in SECURITY.md and
  knowledge.md; it is not presented as a network control.

### Implementation Evidence

- [ ] **Commit SHA:** pending the initial commit.
- [x] **File:line ranges:** `lib/provider.ts:7-8` upstream defaults;
  `lib/gateway.ts:6` provider import; `lib/http.ts:39-55` hostname parsing;
  `lib/store.ts:1-18` barrel; `components/dashboard.tsx:1` barrel;
  `scripts/quality-report.mjs` ceiling scan; `scripts/attribution-guard.mjs`
  commit-message scan.
- [x] **Gate output:** receipts above.
- [x] **Reproducibility:** npm commands and Node version recorded.
- [x] **Step statuses:** eight implemented; two blocked.

### Code Verification Evidence

- [x] Paths exist and barrels resolve; `npm run verify` compiles the full tree.
- [x] Code matches the plan: no remaining `apinex` naming in source outside
  the two default upstream URLs.
- [x] Gates pass with output.
- [x] Production callers verified: chat route → `handleChatCompletions`; sync
  route → `syncProvider`; page → `getOverview`/`Dashboard`.
- [x] Status is `verified`, not closed; closure is waiting on the commit.

### Loop 2 — Independent audit

- **RED:** Final review found the test command was file-specific and will need
  extending when more suites land; the README still linked FID-002 as active
  and must be updated when it archives; the quality script counts a trailing
  newline as a line, matching the core repository's method.
- **GREEN:** Documented the test-command growth path in CONTRIBUTING; closure
  will update the README link. No code change.
- **AUDIT:** Re-derived line counts with `wc -l`, grepped for `apinex` and
  `scaffold`, and re-ran `npm run verify`.
- **ADVERSARIAL:** The split could hide a behavior regression in the dashboard
  without a browser test. `next build` proves compilation, not clicks. Marked as
  a verification gap; no browser run was performed after the split.
- **CHANGE DELTA:** Not measured; this is a retrospective record. No claim of
  convergence is made.

### Loop 3 — Final convergence

- **RED:** Remaining risks: Host-header spoofing, no live provider call after the
  rename, no browser re-test of the split dashboard, no customer auth.
- **GREEN:** No further code corrections; the open items are recorded limits,
  not silently accepted defects.
- **AUDIT:** `npm run verify` exit 0 and the source greps above.
- **ADVERSARIAL:** The repository is ready to publish as a local-development
  gateway, not as a public multi-user service.
- **CHANGE DELTA:** Not measured; retrospective record.

## Resolution

- **Closed Date:** pending the initial commit.
- **Fix Description:** Savant Gateway identity; split store and dashboard;
  governance scaffold; tests, quality, attribution, hooks, and CI.
- **Tests Added:** `tests/http.test.mjs`, six cases, passing.
- **Verification Evidence:** receipts above, 2026-10-29.
- **Archived:** pending commit; will move to `dev/fids/archive/` with the SHA.

## Lessons Learned

Renaming is a production change: package, environment, module, and UI names all
participate, and every one needs a call-graph check. A file-length ceiling is
useful only when applied before the repository is published; splitting along
existing responsibilities is cheap, while carrying a baseline hides the debt.
Governance should be the smallest set of gates the core repository actually
enforces, not a copy of its monorepo machinery.
