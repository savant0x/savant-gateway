# Archived FID receipt audit — 2026-11-06

**Scope:** 176 records in `dev/fids/archive/` at commit `5a1ae3c`, before the
uncommitted free-model and related-reading repairs in this session.
**Method:** a read-only scan of every archived record extracted backticked
repository paths, test filenames, commit-like tokens and Next build IDs. Paths
were checked with `fs.existsSync`, commit tokens with `git cat-file -e`, and the
records that cite real Next build IDs were read in full with the receipts they
name. No record was edited except the one label correction below.

## Build IDs

Three archived records cite a real Next build ID. All three agree with the
receipt they name:

| Record | Build ID | Named artifact | Result |
| --- | --- | --- | --- |
| FID-2026-1030-060 | `Ncl7cgkj2j5fuOzzLPT1A` | `dev/audits/2026-10-31-load-acceptance.json` | The JSON records the same `buildId`, 123 checks and zero failures. |
| FID-2026-1104-009 | `IbsGZjBu7Q51HrQ3KPfsT` | `dev/audits/2026-11-05-browser-matrix-009.md` | The receipt, FID and run JSON all name the same build and 12/12 journeys. |
| FID-2026-1106-001 | `OMN5qQvSNGIvDZtz6wII7` | Its completion receipt and browser result | Both name the same build and 14/14 journeys. That record had already been reopened once for missing order and image-precedence assertions; this audit found no new missing assertion in it. |

No stale or contradictory build citation was found. A Next build ID is a content
hash of a local `.next` artifact and cannot be recomputed from a commit, so the
only available checks are internal consistency and agreement with the named
artifact. Every archived build ID remains a dated receipt, not a reproducible
key.

## Mislabeled build

`FID-2026-1029-034` line 34 said “working tree at build `443cde5`”. `443cde5` is
a commit (`git cat-file -t` returns `commit`), not a 21-character Next build ID.
The word was corrected to “commit”. No evidence, status or date was changed.

## Test filenames that no longer exist

Four cited test filenames are absent at HEAD. None is a receipt claiming a green
run:

| Record | Absent name | Actual status |
| --- | --- | --- |
| FID-2026-1030-059 | `tests/operations-alerts.test.mjs` | Proposed name only. The final gate and receipt use `tests/operations.test.mjs`, which exists. |
| FID-2026-1102-091 | `tests/content-engagement.test.mjs` | Explicitly considered and rejected in Loop 2 as a duplicate. The record's Tests Added line names `tests/content-store.test.mjs`. |
| FID-2026-1102-116 | `tests/gateway-concurrency.test.mjs` | The receipt records it as **1 skipped** because `DATABASE_URL` was unset. Git history shows the file existed in `ed97ae5` and `59dce6d`; it was later removed. The record claims a skip, not a pass. |
| FID-2026-1103-124 | `tests/catalog-pairs.test.mjs` | A planned gate name. The final test receipt uses `tests/model-retrieve.test.mjs`, which exists. |

No archived receipt claims a passing assertion from a test file that never
existed.

## Path drift

The scan found 100 backticked repository paths that no longer exist. They cluster
in the pre-PostgreSQL layout (`lib/store/*`, `lib/db.ts`, `lib/gateway*.ts`) and
retired brand files (`assets/logo.png`, `public/bg-pattern.webp`). These are
historical references from dated receipts, not false claims. They do mean older
commands cannot be replayed literally against the current tree.

## Limits

- A file existing does not prove an assertion exists inside it. The automated
  scan cannot infer intent; the three build-bearing records and their named
  receipts were read manually. Re-verifying every archived assertion would mean
  re-running 176 historical suites against code that has since moved.
- Build IDs cannot be re-derived from git, so no archived build can be
  revalidated today. This audit checks consistency, not reproducibility.
- The scan recognises backticked paths only. A path mentioned in running prose
  without backticks is outside its coverage.
- No archived record was re-opened and no status was changed.
