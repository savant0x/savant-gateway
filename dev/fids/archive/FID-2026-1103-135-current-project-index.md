# FID: Current project status index

**Filename:** `FID-2026-1103-135-current-project-index.md`
**ID:** FID-2026-1103-135
**Severity:** low
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

`docs/project-status.md` is correctly marked superseded but remains easy to
mistake for current status. Replace its stale navigation role with a concise
current index linking to the active FID queue, archived evidence, launch
blockers, latest verification receipt, and operator decisions.

## Impact Assessment

- **Affected components:** `docs/project-status.md`, `docs/README.md`,
  `CHANGELOG.md`, `SCOPE.md`, active launch FIDs.
- **Risk:** low documentation drift and onboarding confusion.

## Proposed Solution

1. **implemented (design):** define one current index with dated freshness,
   source-of-truth links, active blockers, and verification limitations.
2. **implemented (design):** retain historical receipts but label them clearly;
   remove duplicated mutable status claims.
3. **implemented (design):** check every link and ensure the index names no
   agent, secret, or unverified production claim.

## Verification Gates

- `npm run attribution`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run verify`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** dated status can be mistaken for a live project index.
- **GREEN:** one clearly dated index points to authoritative records and labels
  historical evidence.
- **AUDIT:** verify all referenced files exist and compare claims with active
  FIDs and the latest changelog entry.
- **ADVERSARIAL:** broken links, stale counts, hidden blockers, and attribution
  text must fail review.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should history be deleted?** No; historical evidence remains valuable.
2. **Should the changelog become the task queue?** No; it remains a release
   history, while SCOPE/FIDs hold current work.

## Implementation Evidence

- **Commit SHA:** `35c1d35`.
- **Implementation:** `docs/project-status.md` is now a dated index: truth map,
  verification table, active queue with each open obligation, recently closed
  records and links. The old page moved to
  `docs/project-status-2026-10-31.md` with a historical banner; `docs/README.md`
  distinguishes the current index from the historical record.
- **Checks:** every linked record exists; the active queue names only 043, 062,
  068, 126, 127 and 137; the receipt states the Docker limitation and does not
  claim launch acceptance.
- **Tests Added:** No; documentation-only change, verified by inspection and the
  attribution/document gates.
- **Gate output:** `npm run check`, 956 tests (955 pass, 1 skipped, 0 fail),
  quality, build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the page is a dated index; it can lag a later record, which
  the header states.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** the stale navigation role is replaced by one dated index
  with authoritative links; historical receipts are preserved and labeled.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-135-current-project-index.md`.
