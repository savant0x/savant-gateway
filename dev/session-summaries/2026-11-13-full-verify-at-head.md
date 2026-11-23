# Full verification at HEAD 52eab59

Operator instruction: "Run the full verify gate set at HEAD and record the
receipt in a session summary." Automation level 3; strict; single agent. This
was a verification pass: no application code, schema, configuration, database,
deployment or research document was changed. The only writes are this receipt,
two stale next-action rows in `dev/fids/README.md`, and the `CL1` checkbox in
`SCOPE.md`. No inference, payment or publication is claimed.

## Receipt

- Command: `npm run verify`
- Code state: `main` at `52eab59`, clean working tree at start.
- Result: **PASS**, 12/12 gates, 169.0 s (2026-11-13T18:39:20Z to
  18:42:09Z).
- Summary: `.verify/summary.json` (ignored by git; per-gate logs beside it).
- Runtime: Node v24.21.0, npm 12.2.1, disposable native PostgreSQL
  17.11.0-beta.19 on `127.0.0.1:49867`.
- Process exit: `VERIFY_EXIT=0`.

| Gate | Status | Duration | Measured |
| --- | --- | --- | --- |
| `check` (lint + typegen + typecheck) | PASS, exit 0 | 18.6 s | — |
| `storage:check` | PASS, exit 0 | 0.3 s | — |
| `config:check` | PASS, exit 0 | 0.3 s | non-production |
| `repository:check` | PASS, exit 0 | 3.0 s | 12 gates, 11 active FIDs |
| `test` | PASS, exit 0 | 87.2 s | 1,160/1,160, zero skipped |
| `test:postgres` | PASS, exit 0 | 7.8 s | 20/20, zero skipped |
| `quality` | PASS, exit 0 | 0.5 s | 400-line ceiling |
| `build` | PASS, exit 0 | 18.4 s | — |
| `test:visual-builds-browser` | PASS, exit 0 | 13.4 s | — |
| `test:http` | PASS, exit 0 | 8.2 s | — |
| `test:recovery` | PASS, exit 0 | 10.8 s | — |
| `deployment:receipt` | PASS, exit 0 | 0.4 s | clean tree |

No gate was missing, failed, skipped or signalled.

## What this pass covers that the 2026-11-11 receipt did not

The previous full receipt was recorded at `a7ff7d6`. Seven commits landed after
it (`d66a538` through `52eab59`), all identity-calibration work under
FID-2026-1110-002. This run is the first full gate set over that work.

- The unit suite is **1,160 of 1,160 with zero skips**, up from 1,134. The
  added tests are the 26 calibration cases in
  `tests/identity-calibration-bounds.test.mjs`. Standalone `npm test` reports
  16 environment-gated skips; `verify` supplies the disposable PostgreSQL
  handle those 16 need, so the same suite runs without skips.
- The mandatory two-connection PostgreSQL proof is 20/20.
- The build, the browser matrix, the HTTP gate, the recovery drill and the
  deployment receipt all pass on the same tree.
- `repository:check` accepts the new calibration modules and the register at 11
  active records.

## What this receipt does not cover

- It is local and pre-deployment. It does not exercise a hosted Vercel
  deployment, a live upstream, real payment settlement or the bounded load
  acceptance run; `test:load` is deliberately outside `verify`.
- It says nothing about launch readiness. FID-2026-1103-127 still needs the
  operator's dated payment, recovery, alert, load and rollback observations and
  a go pinned to the release SHA.
- It does not certify the identity decision rule. FID-2026-1110-002 steps 4–9
  are unimplemented; the shipped `consistent` / `divergent` multipliers are
  still the invented constants, and no calibration certificate exists.
- The run started from a clean tree at `52eab59`. This record and the register
  reconciliation below were written afterwards, so the tree differs from the
  receipt by those files and their commit only.

## Register reconciliation performed in the same session

Three next-action rows were stale against commits, not against intent:

- FID-2026-1110-002 said "freeze the v3 manifest and power calculation". The
  manifest, its hash, the power proof and the frozen δ are committed at
  `d66a538`, `b884984` and `1f75c44`; the row now points at step 4.
- FID-2026-1104-016 said "planning only". Implementation landed at `3f5a045`.
- FID-2026-1104-017 said "implement after 015 and 016". Its core landed at
  `6cb7486` and `1c4c2a5`; the row now names the remaining closure evidence.

`SCOPE.md` `CL1` is checked complete because its stated scope was registration
and convergence, which the FID records; steps 4–9 remain open in the FID itself.
The register counts are unchanged and verified: 11 active, 180 archived, 191
allocated.

## Follow-on run after step 4 of FID-2026-1110-002

Step 4 of the calibration lab (arm registry, loopback proxy and its 13 tests)
was implemented after the receipt above, so `npm run verify` was run again on
the changed tree:

- Result: **PASS**, 12/12 gates, 156.4 s
  (2026-11-13T18:46:36Z to 18:49:13Z) at `52eab59` with a dirty tree.
- `test`: 1,173/1,173, zero skipped; `test:postgres`: 20/20; every other gate
  PASS.
- The deployment receipt reports `clean: false`, which is correct for an
  uncommitted working tree and is not a deployment claim.

Steps 5–9 of the FID are not implemented. The collection matrix needs an
operator-supplied upstream, credential and routing model ids, and 74.85 h at
the default 10 RPM.
