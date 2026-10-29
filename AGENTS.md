# Savant Gateway

A Next.js gateway for upstream free models: provider sync, hashed consumer keys,
OpenAI-compatible chat completions with streaming, and weighted usage metering.

## Governance Boot Gate

This is a **single-agent repository**. The governing contract is
[`dev/echo-v0.1.2-single-agent.md`](dev/echo-v0.1.2-single-agent.md), reached
through the marker at [`ECHO-single-agent.md`](ECHO-single-agent.md). Read that
file 0-EOF before any work session.

[`ECHO.md`](ECHO.md) is the canonical **harness** protocol (10-agent roster,
Hybrid Mode). It is reference material here. Its Hybrid Mode latitude ("the
Orchestrator writes code directly") does **not** apply to this repository and
must not be used as authority to skip the FID path.

The machine-readable contract lives in
[`protocol.config.yaml`](protocol.config.yaml) under `single_agent.protocol`.
No non-trivial code change is written without a FID that has converged through
the Perfection Loop. The operator is the approval boundary.

## Stack

- **Next.js 16** App Router + route handlers (Turbopack)
- **HeroUI v3** with Tailwind CSS 4
- **SQLite** via `better-sqlite3` (local development storage)
- **TypeScript** strict, Node `>=22.18.0`
- **npm** for installs and gates

## Non-Negotiables

1. **No coding-agent credit.** No agent may be named in a commit message,
   `Co-Authored-By:` trailer, generated-with line, file header, changelog,
   session summary, or FID. The rule is enforced by
   `scripts/attribution-guard.mjs` in the commit hook, pre-push hook, and CI.
   There is no authorized exception.
2. **No secrets in the tree.** `PROVIDER_KEY`, `ADMIN_PASSWORD` and
   `ADMIN_SESSION_SECRET` belong in `.env.local` only. Never print, log, commit,
   or expose them to the browser.
3. **Read before edit.** Read every touched file 0-EOF; no skimming. Never edit
   a project file through a scripted transform.
4. **Verify before claim.** Run the declared gates and paste real output. A
   green build does not prove a feature works.
5. **No placeholders.** No TODOs, stubs, or dead paths presented as working
   features. Document non-goals honestly instead.
6. **Honest UI and docs.** Every label must describe behavior the code performs.

## Commands

```bash
npm install          # also wires .githooks and the commit template
npm run dev          # http://localhost:3000
npm run lint         # eslint ., zero warnings expected
npm run typecheck    # tsc --noEmit
npm test             # node --test tests/
npm run quality      # 400-line file ceiling
npm run build        # next build
npm run verify       # check + test + quality + build
```

The pre-push hook runs the attribution guard, lint, typecheck, tests, quality,
and build. It fails closed.

## Quality Bar

Declared in [protocol.config.yaml](protocol.config.yaml) and enforced where
noted:

- `max_file_lines: 400` — **enforced** by `scripts/quality-report.mjs` over
  `app/`, `components/`, `config/`, and `lib/`.
- Function length 50, line length 100, complexity 10, params 4, comment density
  0.33, nesting 3 — review criteria.
- Zero lint errors and zero lint warnings.
- No duplicated lookup or formatting helpers; use `lib/store/*`,
  `components/dashboard/*`, and `components/admin/*`.

## Layout

```text
app/                    routes: landing (/), console (/dashboard), admin (/admin)
app/api/admin/          admin session and admin-only management endpoints
components/landing/     public landing sections
components/dashboard/   console sections and shared UI primitives
components/admin/       admin panel sections
lib/provider.ts         upstream provider client and catalog sync
lib/gateway.ts          key auth, free-pool routing, streaming, metering
lib/admin-session.ts    session token signing and password verification
lib/admin-auth.ts       server-side admin guards and cookie handling
lib/store/              split persistence modules
lib/db.ts               SQLite schema and connection
assets/                 source logos and favicons; public copies live in public/
tests/                  Node test-runner suites
scripts/                quality and attribution gates
dev/fids/               active FIDs; archive/ for closed records
templates/              FID and session-summary templates
coding-standards/       language standards referenced by the protocol
```

## FID Workflow

New FIDs use `dev/fids/FID-YYYY-MMDD-NNN-{title}.md` and follow
[templates/FID-TEMPLATE.md](templates/FID-TEMPLATE.md). Non-trivial work moves
through RED → GREEN → AUDIT → ADVERSARIAL → COMPLETE on the FID before code,
then closes only with a real commit, verification receipt, CHANGELOG entry, and
move to `dev/fids/archive/`.

Small, reversible documentation or copy fixes may be made directly; they still
must pass the gates and must not claim unverified behavior.

## Version Control

- Conventional commits: `<type>(<scope>): <imperative description> (<FID-ID>)`.
- Commit verified progress in logical slices.
- Do not force-push `main`.
- Do not commit generated state: `.next/`, `data/*.db*`, `.env*.local`,
  `tsconfig.tsbuildinfo`.
- Source brand assets in `assets/` are committed; their runtime copies live in
  `public/`.

## Docs

- [dev/echo-v0.1.2-single-agent.md](dev/echo-v0.1.2-single-agent.md) — governing single-agent protocol
- [ECHO-single-agent.md](ECHO-single-agent.md) — boot marker
- [ECHO.md](ECHO.md) — canonical harness protocol (reference)
- [protocol.config.yaml](protocol.config.yaml) — gates and quality policy
- [docs/echo-protocol.md](docs/echo-protocol.md) — orientation
- [SCOPE.md](SCOPE.md) — approved scope and operator rulings
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and contribution rules
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [knowledge.md](knowledge.md) — project facts and gotchas
