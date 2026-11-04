# Visual builds design — 2026-11-04

## Authority and scope

Operator requested a FID, the full Perfection Loop and presentation. This is
planning only. Selected sources are Pelican SDF and OpenRouter. VoxelBench
remains shelved; SCADBench was explicitly removed as outdated on 2026-11-04.
No code, imports, publication, generation spend or deployment is authorized.

## Intended change and impact

FID-2026-1104-013 specifies a combined public gallery, model-detail examples,
source provenance, exact model matching and guarded operator review. Source
artifacts are executable input; revisions and offline opaque-origin viewing
are part of the contract. Billing, routing and existing article matching are
not changed by this plan. Existing transport hardening is a named dependency.

## Grounding

HEAD at intake: `b735304411df2d6c07195beae2ca6dec3c5fb4c5`.
Concurrent admission changes and two existing chat exports are preserved.
Pelican publishes manifest/result/module records under MIT. OpenRouter games
carry artifact metadata; artifact reuse and the exact voxel page are not yet
established. No source-availability or permission gap is presented as solved.

## Completion receipt

FID-2026-1104-013 is `converged`; no application implementation is claimed.
It remains active; code, source publication and deployment have not occurred.

### Perfection Loop evidence

Initial design: 26,331 characters, normalized LF. Each correction used direct
file editing after reading the FID, with exact Levenshtein distance divided by
the previous snapshot's character count. All corrections remain below 10%.

| Pass | Before | After | Distance | Delta |
| --- | ---: | ---: | ---: | ---: |
| Loop 2: identity/rights/revision/response bounds | 26,331 | 27,696 | 1,467 | 5.57138% |
| Loop 3: gate order/CSP/closure evidence | 27,696 | 29,688 | 2,513 | 9.07351% |
| Loop 4: public reads/concurrency/input bounds | 29,688 | 32,347 | 2,659 | 8.95648% |
| Pass 5: contract/reference/static audit | 32,347 | 32,347 | 0 | 0% |
| Pass 6: adversarial walkthrough | 32,347 | 32,347 | 0 | 0% |
| Receipt/status finalization | 32,347 | 32,893 | 673 | 2.08056% |
| Final audit A: full structure/source/status/test matrix | 32,893 | 32,893 | 0 | 0% |
| Final audit B: adversarial lifecycle/identity walkthrough | 32,893 | 32,893 | 0 | 0% |

The first contract probe found 2/8 requirements explicit. Direct design
corrections addressed all six gaps. Final contract audit is 12/12; adversarial
coverage is 15/15. One adversarial probe initially reported 14/15 because it
looked for different wording of the existing OS-sandbox limitation; correcting
that read-only probe produced 15/15 without a document change. These are
document-coverage audits, not execution/security proofs of future code.

Two consecutive unchanged audits meet convergence. Receipt finalization was
2.08056%, below the 10% correction ceiling; two more unchanged audits of those
final bytes establish convergence again. Final walkthrough coverage: 7/7.
Final FID byte SHA-256:
`31454f38689a0854dcb593153caa6dbcf258aaea7e65e61a5c7d74b88336b8f4`.
No feature claim follows from convergence. Attribution was re-run after final
FID edits and passed; the final three-document diff has no whitespace errors.

### Commands and real output — 2026-11-04

All commands below exited 0:

```text
npm run lint
eslint . --max-warnings=0
(no errors or warnings)

npm run typecheck
next typegen && tsc --noEmit
Generating route types...
Types generated successfully

npm run quality
quality: PASS (400-line ceiling, 599 files scanned)

npm run attribution
attribution-guard: PASS (no coding-agent credit found)
attribution-document-guard: PASS (no governed credit line)

npm run config:check
config-check: PASS (non-production)

node --test tests/benchmarks.test.mjs tests/content-linking.test.mjs tests/catalog-skus.test.mjs tests/model-identity.test.mjs
tests 34
pass 34
fail 0
skipped 0

Read-only FID contract/reference probes
DOCUMENT CONTRACT 12 / 12
EXISTING INTEGRATION REFERENCES 11 / 11
PLANNED UNIT TEST PATHS 5 ALL GATED True
ID 013 UNIQUE True
REGISTERED True
ACTIVE FIDS 15
ADVERSARIAL COVERAGE 15 / 15

Read-only import of scripts/verify-summary.mjs
check -> storage:check -> config:check -> test -> test:postgres -> quality -> build -> test:http -> test:recovery -> deployment:receipt
gate-order grounding: PASS

git diff --check -- SCOPE.md dev/fids/FID-2026-1104-013-model-matched-visual-builds.md dev/session-summaries/2026-11-04-visual-builds-design.md
(no whitespace errors)
```

Full build, full unit/HTTP/PostgreSQL/recovery verification and new feature
tests are implementation acceptance gates. They were not run or claimed for
this planning-only change. Existing 34-test results ground matching behavior;
they do not prove the planned artifact matcher works.

### Implementation handoff

Selected source set: Pelican SDF and OpenRouter only. No SCADBench/GLB lane.
Implement the eight ordered steps in the FID only after operator instruction.
Verify FID-006's shared transport before wiring imports. Record actual artifact
reuse evidence and the exact OpenRouter voxel page if supplied/discovered;
neither is assumed by the confirmed games-artifact contract. Publishing needs
reviewed identity, rights and exact-bundle viewer evidence.

Preserve the concurrently edited admission/rate-limit/schema/test files and
existing chat exports. This pass touches only the FID, its SCOPE section and
this summary. No source has been imported into application storage.
