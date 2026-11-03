# FID: Content freshness and source guidance

**Filename:** `FID-2026-1103-129-content-freshness-and-source-guidance.md`
**ID:** FID-2026-1103-129
**Severity:** medium
**Status:** converged
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

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
- **Archived:** no.
