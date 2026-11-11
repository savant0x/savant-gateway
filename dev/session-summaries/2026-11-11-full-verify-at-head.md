# Full verification at HEAD a7ff7d6

Operator instruction: "Run the full verify gate set at HEAD and record the
current receipt." Automation level 3; strict; single agent. This was a
read-only verification pass: no code, schema, configuration, database,
deployment or research document was changed, and no inference, payment or
publication is claimed.

## Receipt

- Command: `npm run verify`
- Code state: `main` at `a7ff7d6`, clean working tree at start.
- Result: **PASS**, 12/12 gates, 171.3 s (2026-11-11T18:24:13Z to
  18:27:04Z).
- Summary: `.verify/summary.json` (ignored by git; per-gate logs beside it).
- Runtime: Node v24.21.0, npm 12.2.1, disposable native PostgreSQL
  17.11.0-beta.19 on `127.0.0.1:54004`.

| Gate | Status | Duration |
| --- | --- | --- |
| `check` (lint + typegen + typecheck) | PASS, exit 0 | 15.5 s |
| `storage:check` | PASS, exit 0 | 0.4 s |
| `config:check` | PASS, exit 0 | 0.4 s |
| `repository:check` | PASS, exit 0 | 4.3 s |
| `test` | PASS, exit 0 — 1,134/1,134, zero skipped | 88.3 s |
| `test:postgres` | PASS, exit 0 — 20/20, zero skipped | 8.5 s |
| `quality` | PASS, exit 0 | 0.5 s |
| `build` | PASS, exit 0 | 17.7 s |
| `test:visual-builds-browser` | PASS, exit 0 | 14.8 s |
| `test:http` | PASS, exit 0 | 8.6 s |
| `test:recovery` | PASS, exit 0 | 11.8 s |
| `deployment:receipt` | PASS, exit 0 | 0.6 s |

No gate was missing, failed, skipped or signalled.

## What the pass exercised

- The complete unit suite, **1,134 of 1,134 with zero skips**. Standalone
  `npm test` reports 1,118 passes and 16 environment-gated skips; `verify`
  supplies the disposable PostgreSQL handle those 16 tests require, so the
  same suite runs without skips.
- The mandatory two-connection PostgreSQL proof, 20/20, including the
  provider admission, completion-token, content-claim, subscription and
  showcase publication races.
- The production build and the browser matrix, both themes and the configured
  viewports, on bundled Chromium.
- The HTTP gate: 758 checks PASS plus the trial suite, against disposable
  PostgreSQL, including signed webhooks, replay refusal, admin origin checks,
  streaming settlement, and the public route set.
- The recovery drill: dump, destroy, restore, balance reconstruction, replay
  refusal and tampered-dump refusal, 16 PASS lines.
- The deployment receipt at `a7ff7d6`: branch `main`, `clean: true`,
  `vercel: false`, no provider key present in the process environment.

## Limits of this receipt

- It is local and pre-deployment. It does not exercise a hosted Vercel
  deployment, a live upstream, real payment settlement or the bounded load
  acceptance run; `test:load` is deliberately outside `verify`.
- It says nothing about launch readiness. The launch acceptance record remains
  `FID-2026-1103-127`, which still needs the operator's dated payment,
  recovery, alert, load and rollback observations and a go pinned to the
  release SHA.
- The run started from a clean tree at `a7ff7d6`. This record was written
  afterwards, so the tree differs from the receipt by this file (and its
  commit) only.
