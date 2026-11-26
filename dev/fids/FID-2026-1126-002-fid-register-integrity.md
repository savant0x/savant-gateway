# FID: FID register integrity

**Filename:** `FID-2026-1126-002-fid-register-integrity.md`
**ID:** FID-2026-1126-002
**Severity:** medium
**Status:** fixed
**Created:** 2026-11-26
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Check the active register and archive against their recorded evidence. The
folder audit found status drift, missing scope and changelog references, broken
links, and a commit check that passed when it found no commit.

## Environment

Node 24, npm, Git, Gateway at `d44694e` with the operator's working-tree edits.

## Detailed Description

The current check accepts a filename mention anywhere in the register and
looks for only one commit format after a Resolution heading. It does not
require any archive evidence or compare the status in a queue row.

## Impact Assessment

The repository check and its CI and pre-push callers become stricter. This is a
read-only gate. Application behavior and persistence have no dependency on it.

## Proposed Solution

1. Compare active rows with filenames, status metadata, and scope references.
2. Validate archive status, ID uniqueness, changelog coverage, and local Markdown
   file links. Keep historical verified and superseded states where documented.
3. Recognize explicit commit evidence in current and historical forms. Require
   at least one resolving implementation reference for archived records except
   records with an explicit supersession or operator-approved no-code closure.
   A baseline hash has no closure meaning. Require a closure section or a
   dated archival declaration with a verification section for legacy records.
4. Keep the current npm entry point and verify it on the real archive and with
   focused parser tests.

### Verification

Exercise status mismatch, broken links, historical evidence labels, absent
evidence, and the distinction between a design baseline and a closure commit.

## Verification Gates

- gate: test tests/fid-register.test.mjs
- gate: lint
- gate: verify

## Perfection Loop

- **RED:** Folder scan identified five remaining broken archive links, legacy
  closure labels, and 132 archives outside the original commit parser.
- **GREEN:** Use the existing repository check and factor archive parsing into
  a testable read-only module.
- **AUDIT:** A read-only scan found 196 distinct hashes in explicit historical
  evidence labels. All 196 resolve through Git. Records missing those labels
  need explicit evidence after checking their history.
- **ADVERSARIAL:** A baseline hash alone cannot satisfy closure. A missing
  commit is a failure unless a documented historical exception applies. The
  scope and changelog checks match full IDs so follow-up suffixes cannot pass.

## Resolution

- **Implementation:** The active queue, scope registrations, archive metadata,
  relative links, and changelog entries reconcile. The repository check calls
  `checkFidRegister` in `scripts/fid-register.mjs` and resolves archive evidence
  with a single Git batch command.
- **Verification Evidence:** `npm run verify` exited 0 with all 12 gates passing,
  1,244/1,244 tests, 20/20 PostgreSQL concurrency tests, 731 HTTP checks,
  4 browser checks, and the recovery drill. The final metadata checks passed
  a separate `npm run repository:check` and
  `node --test tests/fid-register.test.mjs` (2/2).
- **Step statuses:** Steps 1–4 implemented and verified.
