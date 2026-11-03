# FID: Content freshness and source guidance

**Filename:** `FID-2026-1103-129-content-freshness-and-source-guidance.md`
**ID:** FID-2026-1103-129
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Signal can be sparse when external sources block datacenter traffic or publishers
refuse article retrieval. Readers need source freshness and availability facts
in the hub, while operators need actionable source recommendations, without
exposing URLs, configuration, or internal errors.

## Impact Assessment

- **Affected components:** `lib/content/store/sources.ts`, public Signal pages,
  admin source page, source-status projection and tests.
- **Risk:** medium trust and discoverability degradation.

## Proposed Solution

1. **implemented (design):** reuse the public coarse source projection and add
   last-success, age, state, and empty-state explanation.
2. **implemented (design):** add operator-only remediation hints derived from
   typed failure classes, never raw upstream error text.
3. **implemented (design):** test disabled, delayed, never-fetched, blocked,
   and healthy sources plus content-surface-disabled behavior.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** empty content does not distinguish new, paused, delayed, or broken.
- **GREEN:** public facts and private remediation are separate projections.
- **AUDIT:** trace `listPublicSources` to `/signal`, status, and admin callers.
- **ADVERSARIAL:** raw URLs, secrets, provider responses, and disabled-source
  internals must not reach public output.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should source failure make the hub unavailable?** No; it should explain the
   condition while preserving available content.
2. **Should recommendations auto-change sources?** No; operators retain control.

## Implementation Evidence

- **Commit SHA:** `4b57ebe`.
- **Implementation:** `lib/content/source-guidance.ts` derives typed failure
  classes and public freshness explanations; the Signal hub and status page use
  the public projection, while the admin source table receives remediation hints
  only. Raw upstream text and URLs stay out of public output.
- **Tests Added:** Yes — `tests/content-guidance.test.mjs` covers disabled,
  delayed, never-fetched, blocked and healthy sources plus disabled content.
- **Gate output:** `npm run check`, `npm test` 956 (955 pass, 1 skipped, 0
  fail), `npm run quality`, `npm run build`, `npm run test:http` (751 checks)
  and `npm run test:recovery` pass at `35c1d35`.
- **Limitation:** the skip is FID-126's PostgreSQL concurrency proof.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** readers see freshness and availability; operators see
  typed remediation without private data crossing the public projection.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-129-content-freshness-and-source-guidance.md`.
