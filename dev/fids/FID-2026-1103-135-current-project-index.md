# FID: Current project status index

**Filename:** `FID-2026-1103-135-current-project-index.md`
**ID:** FID-2026-1103-135
**Severity:** low
**Status:** converged
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

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
- **Archived:** no.
