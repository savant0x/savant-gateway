# FID: Rebuild the resale scaffold on a verified Next.js + HeroUI core

**Filename:** `FID-2026-1029-001-nextjs-gateway-rebuild.md`
**ID:** FID-2026-1029-001
**Severity:** high
**Status:** closed
**Created:** 2026-10-29 01:14 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. That file is a
project copy of `C:/Users/spenc/dev/savant-code/templates/FID-TEMPLATE.md`. At
authoring time this npm project had **no** `protocol.config.yaml` and **no**
`fid:verify`, `quality:report`, `scope:check`, `validate:repository`,
`progression` or `balance` scripts; those template references are recorded as
unavailable below rather than invented. `fixed` is an accepted legacy status and
is not used here. `implemented` is a step status, never a FID status. The record
is now `closed` against `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first
commit containing the rebuilt tree, and is archived at
`dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md`.

## Summary

The inherited project was a resale scaffold whose product surface (admin console,
status page, revenue reporting, subscriptions, referrals, billing, promo events)
was largely non-functional or misleading, while a small provider/gateway path did
work. On 2026-10-29 the operator ruled that the Vite/Fastify product shell be
abandoned and rebuilt on Next.js 16 + HeroUI v3 with only the verified core
preserved: provider sync, consumer-key auth, free-model routing, streaming, and
usage metering. This FID records that finding, the rebuild, and its evidence. It
is **retrospective**: implementation preceded this document, so this record does
not claim pre-implementation convergence and does not retroactively make the
original implementation plan-first.

## Environment

- **OS:** Windows, `MINGW64_NT-10.0-26300 3.6.10-5a1665c8.x86_64` (Git Bash),
  2026-10-29 01:11 EDT.
- **Language/Runtime:** Node `v24.21.0`; npm `12.2.1`; Python `3.14.7` used only
  for the document change-distance measurement described in the Perfection Loop.
- **Tool Versions:** `next 16.4.3`; `@heroui/react 3.2.7`; `better-sqlite3 13.0.3`;
  `react 19.3.0`; `typescript 5.9.3`; `tailwindcss 4.3.3`; `eslint 9.39.5`.
- **Commit/State at authoring:** **no Git repository.** `git status --short`
  printed `fatal: not a git repository (or any of the parent directories): .git`
  and exited `128` at 2026-10-29 01:09 EDT; there was no `.git` directory in the
  workspace listing. There was consequently no commit SHA for any step.
  Pre-existing working state: `.env.local` holds the operator's provider key
  (present, deliberately unread); `data/gateway.db` is local runtime state;
  `.next/` is build output; `templates/FID-TEMPLATE.md` is the operator-supplied
  template.
- **Closure state:** Git `main`; the rebuilt tree was committed as
  `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`. The provider client named
  `lib/apinex.ts` at authoring is `lib/provider.ts` in that commit. The closure
  gate is the current `npm run verify`, not the historical `check`/`build` pair.

## Detailed Description

### Problem

The read-only review of the legacy tree recorded fifty findings in `SCOPE.md`
(D1-D50) on 2026-10-28. The findings were not cosmetic: several advertised
features had no working implementation, and the customer-key model stored
secrets at rest. Representative evidence:

- D28: five complete admin pages and three public components had no importer or
  route ("`src/App.tsx` does not import or route `AdminApiKeys`,
  `AdminAuditLogs`, `AdminEvent`, `AdminLevels`, or `AdminPricing`").
- D29: notification, health, and revenue-reporting subsystems were stubs. Example:
  `server/modelStatusPoller.ts:3-25` was entirely empty, so call sites always
  returned `no_data`; `server/userBalanceAlerts.ts` was entirely empty;
  `server/revenueReports.ts` built totals and never invoked a transport.
- D12: "`api_keys.secret` is written verbatim (`server/routes.ts:1291-1293`,
  `server/playgroundAuth.ts:40-42`), returned by `GET /api/user/keys`
  (`server/routes.ts:1245,1261`)". Authentication used a hash, so the plaintext
  existed only for redisplay, but a database read yielded every customer key.
- D49/D50: the provider's public metadata set `allowFree` on paid models that
  still returned `402` on a zero-balance account, and the gateway's free-tier
  metering ignored the provider's weighted pool.
- D38: `start: "tsx server/index.ts"` used a devDependency and never executed the
  built `dist-server/` output; no production static-hosting step was documented.

The operator judged the project unlaunchable as built and authorized a clean
rebuild on Next.js 16 + HeroUI v3, keeping only the verified provider/gateway
core (`SCOPE.md`, operator ruling, 2026-10-29).

### Expected Behavior

A runnable local scaffold that exposes only paths with working implementations:

- provider sync (balance, subscription, `/v1/models`, public metadata) into local
  SQLite;
- consumer keys created once, stored only as SHA-256 hashes, revocable;
- OpenAI-compatible `POST /v1/chat/completions` for the `free/*` pool, streaming
  or JSON, with usage metering that reflects the provider's weighted units;
- `GET /v1/models` authenticated by a consumer key;
- a one-page HeroUI dashboard whose labels match what the server actually does;
- explicit, documented non-goals rather than stubs that pretend to work.

### Root Cause

The scaffold was assembled feature-first: routes, pages, settings, and dashboards
were generated before the implementations behind them, and no gate distinguished
"renders" from "works". A secondary mechanism was trusting the provider's
`allowFree` flag as an access decision. Live probes on 2026-10-29 showed that
`free/claude-opus-4.6` carries `allowFree: false` and returns `402`, while paid
models marked `allowFree: true` still return `402 Insufficient balance` on a
zero-balance account. The free signal that actually works is the `free/*` pool.

### Evidence

Historical review evidence, dated 2026-10-28, is recorded with `file:line` quotes
in `SCOPE.md` (D1-D50) and is not reproduced in full here.

Live provider/gateway evidence, dated 2026-10-29 and recorded in `SCOPE.md`'s
progress log (historical, not re-run for this document):

- `POST /api/provider/sync` → `200`, **45 models**, **11 free-pool models**.
- `free/gpt-6-luna`, non-streaming → `200`, real answer, 1.5 s.
- `free/gpt-6-luna`, `stream: true` → `200 text/event-stream`, real answer.
- Missing key → `401`; fake key → `401`; paid `gpt-6-luna` → `402` locally with no
  upstream call.
- UI-created key plus browser gateway tester → `200`; usage rows recorded
  weighted tokens (`990` and `948` for `330`/`316` raw tokens at weight `3`).

Fresh read-only database probe, 2026-10-29 01:11 EDT:

```text
models 45
api_keys 0
usage_events 0
users 1
free models 11
provider {"status":"active","balance_usd":0,"rpm":15,"rpm_plan":"free",
          "subscription_mode":"free","subscription_tokens_remaining":19173476}
```

Fresh gate evidence, run 2026-10-29 after 01:11:46 EDT (full receipt below):

```text
npm run check  → check_exit=0
npm run build  → build_exit=0
```

The legacy tree's absence is observed, not assumed: the root `ls -la` at
2026-10-29 01:09 EDT contains no `src/`, `server/`, `shared/`, `tests/`,
`vite.config.ts`, `tsconfig.app.json`, `tsconfig.server.json`, or
`tsconfig.server.build.json`. Only the Next.js tree, `lib/`, `components/`,
`app/`, `config/`, `styles/`, `public/`, `templates/`, `data/`, and tooling files
remain.

## Impact Assessment

### Affected Components

Removed legacy paths: the entire Vite/Fastify product shell (`src/`, `server/`,
`shared/`, old `tests/`, `vite.config.ts`, `tsconfig.app.json`,
`tsconfig.server.json`, `tsconfig.server.build.json`, `.oxlintrc.json`,
`echo-v0.1.2-single-agent.md`). No production data or deployed environment is
present in this workspace. No migration was written: the new schema is created
fresh by `lib/db.ts`, and the legacy database is not read.

New/replaced paths:

- `app/v1/chat/completions/route.ts` — gateway entry point.
- `app/v1/models/route.ts` — authenticated model list.
- `app/api/{keys,models,usage,provider/sync}/**` — localhost-guarded dashboard
  actions.
- `app/page.tsx`, `components/dashboard.tsx` — HeroUI dashboard.
- `lib/apinex.ts` — provider client, metadata, sync.
- `lib/gateway.ts` — key auth, free routing, streaming, metering.
- `lib/store.ts`, `lib/db.ts` — queries and SQLite schema.
- `lib/api-keys.ts`, `lib/http.ts`, `lib/types.ts` — key hashing, HTTP helpers,
  serializable types.

Dependency impact: Fastify/Vite/React 19-era tooling replaced by Next.js 16,
HeroUI v3, Tailwind 4, and `better-sqlite3`.

### Risk Level

- [ ] Critical: crash, data loss or security vulnerability.
- [x] High: major feature broken.
- [ ] Medium: degraded behavior or missing verification.
- [ ] Low: minor or cosmetic issue.

The legacy surface could misstate revenue and model health, silently drop
operational alerts, and expose customer keys from a database read (D12, D29,
D30/D31, D37). Containment: the rebuild is local-only, nothing is deployed, no
external accounts or customer data exist, and the legacy tree was deleted only
after the verified core had been re-expressed in `lib/`.

## Proposed Solution

### Approach

Reuse the parts proven end to end against the live provider and delete the rest.
Concretely: keep the provider endpoints and the `src: "gate"` request hint
(`lib/apinex.ts:106,207`), the SHA-256 consumer-key model, the free-pool routing
rule, SSE forwarding with usage capture, and the usage table. Re-express them
as Next.js route handlers and server-only modules instead of porting Fastify
routes.

Alternatives considered and rejected:

- Patching the fifty legacy findings: the amount of broken surface exceeded the
  value of any individual fix, and several findings were symptoms of the same
  stub-first assembly.
- Keeping the Vite/Fastify shell and adding Next.js pages beside it: two runtimes
  and two build systems for one small gateway.
- Implementing auth, billing, subscriptions, or admin roles in the scaffold:
  unrequested surface that would repeat the failure mode. They are documented as
  non-goals instead.

Reuse check: `hashApiKey` was extracted from the legacy key module; the gateway's
`readUsage`, key extraction, and error sanitization were rewritten in
`lib/gateway.ts` and `lib/http.ts` rather than imported from the deleted tree.
Robust defaults: SQLite WAL and `busy_timeout`, `serverExternalPackages` for
`better-sqlite3`, 120 s/300 s upstream timeouts, CORS headers on the OpenAI
paths.

Concrete limits, stated rather than claimed away:

- No customer auth or ownership; every key belongs to the seeded `user_dev`.
- No billing; paid models are catalogued but rejected locally with `402`.
- No rate limiting or concurrency control.
- One provider key and one shared free pool; metering records weighted units but
  does not reserve provider capacity.
- SQLite is local development storage, not a multi-instance database.
- The dashboard-write guard is a Host-header check, not a network control (see
  Findings and Closure Status under Resolution).

### Steps

All steps below ran before this document existed; the template's requirement to
identify them as planned was not met. This historical violation is preserved
rather than backfilled.

1. `implemented` — Extract the verified provider/gateway behaviors from the
   legacy tree into `lib/apinex.ts`, `lib/gateway.ts`, `lib/store.ts`,
   `lib/db.ts`, `lib/api-keys.ts`.
2. `implemented` — Generate the official HeroUI Next.js 16 template and make it
   the project shell (`package.json`, `app/`, `components/`, `config/`,
   `styles/`, `next.config.mjs`, `eslint.config.mjs`).
3. `implemented` — Remove the legacy Vite/Fastify tree and its configs, plus the
   then-empty `templates/` scaffolding, after the core was re-expressed. The
   operator re-added `templates/FID-TEMPLATE.md` on 2026-10-29 01:09 EDT.
4. `implemented` — Implement provider sync: balance, subscription, `/v1/models`,
   public metadata merge, `free/*` access classification, provider status
   persistence (`lib/apinex.ts:312`, `lib/apinex.ts:90`).
5. `implemented` — Create the SQLite schema: `users`, `api_keys`, `models`,
   `usage_events`, `provider_status` (`lib/db.ts:40`, `lib/db.ts:70`,
   `lib/db.ts:86`).
6. `implemented` — Generate `sk-` secrets with `randomBytes(32)` and store only
   the SHA-256 hash plus a mask (`lib/api-keys.ts:5-14`,
   `lib/store.ts:231-253`).
7. `implemented` — Authenticate consumer keys against `secret_hash`, require an
   active key and active user, and update `last_used_at`
   (`lib/store.ts:265-292`).
8. `implemented` — Route only `free/*` models with a positive weight upstream,
   reject paid/subscription models locally, and forward streaming or JSON with
   `include_usage` (`lib/gateway.ts:189`, `lib/gateway.ts:236`).
9. `implemented` — Record one usage row per completed, failed, or cancelled
   upstream attempt with raw tokens, weighted tokens, cost, latency, status, and
   a truncated error (`lib/store.ts:294-335`, `lib/gateway.ts:125-187`).
10. `implemented` — Add the localhost-guarded dashboard endpoints for sync, keys,
    models, and usage (`lib/http.ts:39-43`, `lib/http.ts:45-53`).
11. `implemented` — Build the one-page HeroUI dashboard: provider status, catalog,
    key creation/revocation, a gateway tester with streaming, and usage history
    (`components/dashboard.tsx`, `app/page.tsx:1-8`).
12. `implemented` — Document the architecture, access rule, API surface,
    non-goals, and verification in `README.md`; record the operator ruling and
    rebuild evidence in `SCOPE.md`.
13. `implemented` — Run `npm run check` and `npm run build` and the live provider
    probes recorded above.
14. `implemented` — Author this FID from the operator-supplied template and place
    it in `dev/fids/`.
15. `implemented` — Close and archive this FID against
    `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first commit containing the
    rebuilt tree. The FID is archived under `dev/fids/archive/`.

### Verification

Existing automated tests at authoring: **none.** `package.json` declared
`dev`, `build`, `start`, `lint`, `typecheck`, and `check`; there was no `test`
script. The closure state has nine suites and 48 tests, all passing under
`npm run verify`; the historical gap is preserved rather than backfilled.

Existing probes: the live HTTP calls listed under Evidence, executed against a
throwaway database with the operator's provider key and recorded in `SCOPE.md`.
Boundary cases exercised: missing key (`401`), fake key (`401`), paid model
(`402`), streaming and non-streaming success, UI-created key through the gateway
tester, and usage rows with weighted tokens. **Not** exercised: malformed JSON
body, empty `messages`, revoked key, upstream 5xx, upstream timeout, concurrent
requests, and a second consumer key.

Current checks for this record: fresh `npm run verify`, a fresh read-only
database count, and source searches proving the production call graph. Their
receipts follow; the historical `check`/`build` receipts are preserved below.

## Verification Gates

The template names `npm run fid:verify`, `npm run quality:report`,
`npm run scope:check`, `npm run validate:repository`, `npm run progression`, and
`npm run balance`. At authoring time none existed in this project and
`protocol.config.yaml` was absent (probe 2026-10-29 01:09 EDT:
`ls -la protocol.config.yaml .git` produced no output). There was no `scripts/`
directory and no gate registry. The repository now has `protocol.config.yaml`
and these gates:

- `npm run lint` → `eslint .`
- `npm run typecheck` → `tsc --noEmit`
- `npm run test` → `node --test "tests/*.test.mjs"`
- `npm run quality` → the 400-line file ceiling
- `npm run build` → `next build` (Turbopack)
- `npm run verify` → all of the above

Feature probes are manual HTTP calls, not registered gates:

- `POST /api/provider/sync` with a running server and `PROVIDER_KEY` set.
- `POST /api/keys` to mint a consumer key.
- `POST /v1/chat/completions` to `free/gpt-6-luna`, `stream: false` and `true`.
- Negative calls: no key, fake key, paid model.
- Read-only SQLite counts after the run.

Source/call-graph checks used for this document:

- `grep -n "export async function POST" app/v1/chat/completions/route.ts` and the
  import of `handleChatCompletions`.
- `grep -n "createDevApiKey" app/api/keys/route.ts lib/store.ts`.
- `grep -n "authenticateApiKey" app/v1/models/route.ts lib/store.ts`.
- `grep -n "syncProvider" app/api/provider/sync/route.ts lib/apinex.ts`.

Document checks: this file against `templates/FID-TEMPLATE.md` for required
sections; `README.md` and `SCOPE.md` for claims that match the code.

## Verification Receipt

### Closure gates

Execution date: 2026-10-29, before this record was archived. The command ran
from the project root on `main` with the repository's own npm script. Key
output:

```text
$ npm run verify
ℹ tests 48
ℹ pass 48
ℹ fail 0
ℹ skipped 0
quality: PASS (400-line ceiling, 125 files scanned)
...
verify_exit=0
```

The build emitted 33 routes, including `/signup`, `/account`, `/admin`,
`/admin/pricing`, `/admin/analytics`, `/api/webhooks/stripe`, `/v1/models`, and
`/v1/chat/completions`. Lint and typecheck emitted no warnings or errors.

### Historical authoring gates

Execution date: 2026-10-29, after 01:11:46 EDT (the exact per-command clock time
was not captured; the environment probe timestamp is the anchor). Commands ran
from the project root with the project's own npm scripts.

### Authoring `check` and `build`

```text
$ npm run check
npm notice run apinex-gateway@0.1.0 check
npm notice run npm run lint && npm run typecheck
npm notice run apinex-gateway@0.1.0 lint
npm notice run eslint .
npm notice run apinex-gateway@0.1.0 typecheck
npm notice run tsc --noEmit
check_exit=0
```

```text
$ npm run build
▲ Next.js 16.4.3 (Turbopack)
- Environments: .env.local
✓ Running next.config.mjs took 16ms

  Creating an optimized production build ...
✓ Compiled successfully in 723ms
  Running TypeScript ...
  Finished TypeScript in 1580ms ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/2) ...
✓ Generating static pages using 11 workers (2/2) in 472ms
  Finalizing page optimization ...

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

Both gate outputs were captured through `tail` (`tail -n 20` for `check`,
`tail -n 30` for `build`) with `set -o pipefail`, so the recorded `*_exit` value
is the npm command's status rather than the pipe's. The Next.js output above is
complete from `▲ Next.js` through `build_exit=0`; the two `npm notice` lines that
preceded it are omitted. No build warnings were emitted.

### Authoring database probe

Read-only connection to `data/gateway.db`, 2026-10-29 01:11 EDT:

```text
models 45
api_keys 0
usage_events 0
users 1
free models 11
provider {"status":"active","balance_usd":0,"rpm":15,"rpm_plan":"free",
          "subscription_mode":"free","subscription_tokens_remaining":19173476}
```

### Source fingerprints

```text
317104483c50874818770d87fc9c5b04a9c445b8e092dbfd53b638ce2de8d158  lib/api-keys.ts
ff3c661ac537d53fc43c7dedd096e21d27c8428c27de16ec6534c35478ac9d7d  lib/apinex.ts
34aa07e4ceb465bfb447c4d5c7d1d7047704da0740addf3de025e42914178da4  lib/db.ts
b05517b7ebb8be1a5d2b6ce44f702de6c71d51ae826789deb69c477034fc6408  lib/gateway.ts
e98ecace2fc9ca7ef8384a2502bcdca0f321c8d84651fef2674e516db5541519  lib/http.ts
0d50a02020dc2b611a827e3eea204b8399e28f2d843685ee27d5acb4bfc3c77b  lib/store.ts
98482976f04dbdb16f469de2230e93af634b001e44089e44e077037e0f28a3f0  lib/types.ts
67d9b6ea43194666aa328920383a9b6755aa3a997c76b2c774ec20bd5114f162  app/api/keys/route.ts
a0f50f3b31b5cdc4110834cba2d2f646e2f4011c419292008103d6ee49c21f2c  app/v1/chat/completions/route.ts
```

### Historical live evidence (not fresh)

The HTTP probes described under Evidence ran on 2026-10-29 before this document
and are recorded verbatim in `SCOPE.md`. File modification times place
`lib/gateway.ts` and `lib/store.ts` at 00:50, `lib/apinex.ts` at 00:57, and the
live run after that; only `lib/db.ts` (01:07, `:memory:` handling) and
`components/dashboard.tsx` (01:07, default free-model selection) changed
afterwards. Neither change affects gateway routing, key auth, metering, or
provider sync. The browser-console check was performed before the dashboard
change and is therefore **historical**; it does not prove the current bundle.

### Missing or unverified at authoring

- No Git commit at authoring; closure is now recorded against `bf3da9a`.
- No browser re-check after the final dashboard edit.
- No automated tests at authoring; the closure suite now has 48 tests.
- No independent second-party verification.
- No runtime verification of the Host-header guard at authoring; FID-006 later
  recorded a production `403` for a spoofed `Host: localhost`.

## Perfection Loop

This loop audits the document, not the code. Because the implementation already
existed when the document was authored, these passes cannot establish
pre-implementation convergence; they can only show the record converged as a
record. Baseline is the first version of this file, preserved with every pass in
`dev/fids/audit/` (`v1-baseline.md` through `v5-audit.md`).

Measurement method: each pass compares the document body before and after the
pass, excluding this Perfection Loop section, because loop receipts are appended
after the measurement and would otherwise measure themselves. Python 3.14.7
`difflib.SequenceMatcher` produces the edit script; the delta is the sum of the
longer side of every non-equal opcode, divided by the previous body's character
count. This is a measured character edit distance with a stated method, not an
estimate. The audit scripts are ephemeral; the version files and character
counts are retained so the numbers can be re-derived.

### Loop 1 — RED

- **RED:** Defects in the first draft and in the claims it inherited:
  1. `Status: closed` was considered and rejected: there is no commit. A closed
     record would have been false.
  2. The inherited "localhost-only" claim is not a network control: the guard
     reads the attacker-controlled `Host` header.
  3. The dashboard and README claim every gateway request writes a usage row;
     pre-upstream rejections (`401`, `400`, `402`, `404`) do not.
  4. The record is retrospective; steps cannot honestly be marked "planned".
- **GREEN:** Mark the FID `verified` and state the closure blocker. Record the
  Host-header weakness as an open finding with code evidence. Record the usage
  copy overclaim as an open low-severity finding. Preserve the retrospective
  violation in the Steps section instead of rewriting history.
- **AUDIT:** `git status` exit `128`; `lib/http.ts:39-43`; `lib/gateway.ts:189-285`
  returns before `recordUsage` on every early rejection;
  `components/dashboard.tsx:869-870` and `README.md:118` contain the overclaim.
  Fresh gates pass.
- **ADVERSARIAL:** A remote caller can send `Host: localhost` and reach
  `/api/keys` if the server is exposed; `[::1]:3000` also fails the guard because
  `split(":")[0]` yields `[`. A cancelled stream records only the usage parsed up
  to disconnection, so provider consumption can exceed recorded usage. A failed
  usage insert is swallowed by design, so metering can lose rows silently.
- **CHANGE DELTA:** Baseline authoring; no preceding document, so no percentage
  applies.

### Missed Questions

- **Ownership:** one seeded `user_dev`; no sign-in, no per-customer ownership.
  Answer: documented as a non-goal; key endpoints are guarded.
- **Retries:** none. Provider failures map to `502` (or pass through `400`,
  `402`, `429`) without retry. Answer: acceptable for the scaffold, stated.
- **Concurrency:** SQLite WAL, `busy_timeout = 5000`, synchronous writes per
  request, one Node process. Answer: works locally; not a multi-instance design.
- **Migration:** no migration path from the legacy database; it is not read, and
  no production data is present in this workspace. Answer: stated in Affected
  Components.
- **Failure handling:** upstream failures are sanitized
  (`lib/gateway.ts:68-73`); usage-write failures are swallowed; no retry queue.
  Answer: recorded as a limit, not hidden.
- **Observability:** no structured logs, metrics, or alerts. Answer: the legacy
  alerting stubs were deleted rather than faked; absence is documented.
- **Honest UI claims:** one usage-row overclaim found; the key-storage claim is
  accurate; the provider-status card reflects stored sync state. Answer: the
  overclaim was recorded open below and resolved by the rebuilt dashboard.
- **Security of the local guard:** Host header trusted; IPv6 branch dead at
  authoring. Answer: the production path no longer uses the loopback bypass;
  see the closure status below.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first
  commit containing the rebuilt tree. The authoring tree was committed there
  after the no-repository period described above.
- [x] **File:line ranges:** authoring paths: `lib/api-keys.ts:5-14`
  (`createHash("sha256")`, `randomBytes(32)`); `lib/store.ts:265-292`
  (`secret_hash` lookup, active key and user, `last_used_at` update);
  `lib/gateway.ts:236` (`const isFree = model.allowFree && model.tokenWeight >
  0;`); `lib/gateway.ts:125` (SSE `ReadableStream` with usage capture);
  `lib/gateway.ts:68-73` (`safeUpstreamMessage` masks 5xx/401/403);
  `lib/apinex.ts:312` (`syncProvider`); `lib/apinex.ts:90` (`getProviderKey`
  throws `ProviderConfigError`); `lib/db.ts:40,70,86` (schema);
  `app/v1/chat/completions/route.ts:7` (production entry);
  `app/page.tsx:1-8` (dashboard entry); `lib/http.ts:39-43` (local guard).
  The provider module is `lib/provider.ts` in the closure commit.
- [x] **Gate output:** authoring `npm run check` and `npm run build` both exited
  `0` on 2026-10-29; the closure `npm run verify` exited `0` with 48/48 tests,
  quality PASS over 125 files, and 33 routes.
- [x] **Reproducibility:** exact commands and environment in the Verification
  Receipt; historical HTTP steps in `SCOPE.md`.
- [x] **Step statuses:** 15 `implemented`.

### Code Verification Evidence

- [x] Affected paths exist: `app/`, `lib/`, `components/`, `config/`, `styles/`,
  `public/`, `templates/`; legacy paths absent from the root listing.
- [x] Code matches the final solution, including the free-pool correction:
  `lib/apinex.ts` classifies only `free/*` (or provider `Free`) with
  `allowFree !== false` as free; `lib/gateway.ts:236` requires a positive weight.
- [x] Declared gates pass with output. The authoring absence of tests is
  preserved in the historical receipt; the closure suite now has 48 tests, and
  `fid:verify` remains unavailable.
- [x] Production wiring has callers: `app/v1/chat/completions/route.ts` imports
  `handleChatCompletions`; `app/v1/models/route.ts` imports `authenticateApiKey`
  and `listModels`; `app/api/keys/route.ts` imports `createDevApiKey` and
  `listApiKeys`; `app/api/provider/sync/route.ts` imports `syncProvider`;
  `app/page.tsx` imports `Dashboard` and `getOverview`.
- [x] Status reflects code and verification, not the original plan: `closed`
  against `bf3da9a`, with the closure findings reconciled below.

### Loop 2 — Independent audit and self-correction

- **RED:** Remaining defects in the first draft: the build receipt quoted
  `Generating static pages (11/11)`, but the captured output says `using 11
  workers (2/2)`; several `file:line` ranges were approximate (`recordUsage` was
  cited through 344 but ends before 335; `localOnlyError` through 56 but ends at
  53; `app/page.tsx` through 7 but ends at 8); the Created time was written as
  01:12 while the file's actual timestamp is 01:14; "complete build output"
  omitted the two `npm notice` lines; and step 3 omitted that `templates/` was
  re-added after removal.
- **GREEN:** Every listed defect was corrected in this pass. Body change was
  measured (not estimated) against the preserved baseline.
- **AUDIT:** A different method was used: every range was re-derived with `grep
  -n` and `sed -n`, the Created time with `stat -c '%y'`, and each quoted gate
  line compared against the captured command output.
- **ADVERSARIAL:** Strongest remaining counterexample: the spoofable-Host finding
  is code inspection only; no request with a forged `Host` header was sent, so
  exploitability on the current runtime is unproven and is marked as such. The
  historical browser evidence also predates the final dashboard edit.
- **CHANGE DELTA:** **3.101%** of the preceding body (v1 body 21,799 characters;
  676 changed characters). Above the 2% stability threshold, so not converged.

### Loop 3 — Final convergence

- **RED:** Final risks: (1) no commit exists, so the FID cannot close; (2) the
  Host-header finding is inspection-only and unproven at runtime; (3) there are
  no automated tests; (4) the browser console evidence predates the last
  dashboard edit; (5) no second party has verified the result. Residual document
  defects found in this pass: the Limits section pointed at Loop 2 rather than
  Open Findings; Loop 1's audit still cited `lib/http.ts:39-42` and a single-line
  dashboard citation; the migration answer still asserted abandonment "with no
  production data"; and the gate section claimed a `scripts/lib/` registry check
  that was never performed.
- **GREEN:** All five document defects were corrected. The plan itself did not
  change: the same verified core, the same free-pool rule, the same explicit
  non-goals. At that pass the closure blocker and the open findings remained
  open rather than being papered over; the Closure Reconciliation section
  records their later resolution.
- **AUDIT:** Independent re-read of the full document against
  `templates/FID-TEMPLATE.md`, re-derivation of every `file:line` with `grep -n`
  and `sed -n`, `stat -c '%y'` for the Created time, and a fresh read-only SQLite
  query. The two most recent passes were measured, not asserted.
- **ADVERSARIAL:** Strongest remaining counterexample: a reviewer with shell
  access to a publicly exposed instance could still prove the Host-header guard
  bypass, which this record does not test. The verification also does not prove
  behaviour under concurrent requests, upstream 5xx, or a revoked key, and the
  historical browser receipt does not cover the current dashboard bundle.
- **CHANGE DELTA:** Pass v2→v3 measured **2.168%** (still above the 2% threshold);
  pass v3→v4 measured **0.610%**; pass v4→v5 measured **0.435%**. Two consecutive
  passes below 2% with no actionable plan findings: **converged as a record**.
  This convergence is documentary only and does not establish pre-implementation
  convergence or authorize closure.

## Resolution

- **Closed Date:** 2026-10-29.
- **Closed Against:** `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first
  commit containing the rebuilt Next.js/HeroUI tree. The provider module is
  `lib/provider.ts` in that commit.
- **Fix Description:** a Next.js 16 + HeroUI v3 gateway that syncs the provider
  catalog, mints hashed consumer keys, routes models with streaming and weighted
  usage metering, and records sell price, upstream cost, and usage. At authoring,
  paid models, customer auth, billing, rate limits, multi-key pooling, and admin
  roles were outside this rebuild; FID-2026-1029-004 and FID-2026-1029-006 added
  catalog pricing, credits, customer accounts, and payments later.
- **Tests Added:** at authoring none. The closure state has nine suites and 48
  tests, all passing under `npm run verify`; the historical gap is preserved.
- **Verification Evidence:** closure receipt above (`npm run verify` exit 0;
  48/48 tests; quality PASS over 125 files; 33-route build) plus the historical
  live probes in `SCOPE.md`.
- **Archived:** `dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md`.

### Findings and Closure Status

- **Host-header guard (high, security) — resolved for production.** The
  development bypass is compiled out when `NODE_ENV=production`
  (`lib/admin-auth.ts`, `ALLOW_LOOPBACK_CONSOLE`), so `/api/keys`,
  `/api/provider/sync`, `/api/models`, and `/api/usage` require an admin session
  on an internet-facing build. FID-2026-1029-006 recorded a spoofed
  `Host: localhost` request returning `403`. Development still uses the loopback
  convenience; `knowledge.md` documents that it must never gate privileged
  actions on an exposed server.
- **Usage-row copy (low, documentation) — resolved.** The cited
  `components/dashboard.tsx` was removed in the rebuild, and the current
  `README.md` describes settlement for completed, failed, or stream-closed calls
  rather than claiming a row for every rejected request.
- **Cancelled-stream metering (medium) — mitigated.** `lib/gateway-stream.ts`
  now calls the settlement path on `cancel`, using provider-reported usage when
  a `usage` chunk arrived and an estimate from streamed characters otherwise, so
  a disconnect records a charge instead of zero. Exact provider consumption
  after the client disconnects remains unobservable without provider-side
  reporting; the estimate is the current behavior.

## Closure Reconciliation

Closed on 2026-10-29 after the repository was published. The original
`verified` status and the missing-commit blocker were correct at authoring time;
`bf3da9a` superseded them. FID-2026-1029-006 disabled the production loopback
bypass and added the customer/payment surface and its 48-test closure suite.
The current tree builds 33 routes and scans 125 files under the quality ceiling.
The three findings above were reconciled against that code before this record
was archived.

## Lessons Learned

Generation order determines whether a scaffold is honest. When routes and screens
are created before the behavior behind them, the UI becomes a claim the server
cannot honor, and a green build proves only that the claim compiles. The
prevention rule: implement the smallest end-to-end path first, verify it against
the real external system, then add surface only where a working caller exists;
delete anything else instead of stubbing it. A second rule: an access decision
must come from the system that enforces it. Provider metadata advertised
`allowFree` on models that still returned `402`; the reliable signal was the
`free/*` pool, confirmed by a live call. A third rule: a guard that reads
client-supplied headers is a routing hint, not a security boundary, and must not
be described as one.
