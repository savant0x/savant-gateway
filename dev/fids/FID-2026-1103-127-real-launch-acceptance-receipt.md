# FID: Real launch acceptance receipt

**Filename:** `FID-2026-1103-127-real-launch-acceptance-receipt.md`
**ID:** FID-2026-1103-127
**Severity:** critical
**Status:** fixed
**Created:** 2026-11-03
**Automation level:** 2
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-126, FID-2026-1103-131

## Summary

The automated suite does not prove a real payment/IPN journey, funded paid
inference, hosted restore/rollback, delivered alert, or approved load envelope.
This FID defines one redacted operator acceptance receipt that records each
external observation without claiming success from fixtures.

## Impact Assessment

- **Affected components:** `dev/fids/FID-2026-1030-043-launch-master.md`,
  `dev/fids/FID-2026-1030-062-launch-acceptance-and-rollout.md`, payment,
  gateway, backup, alerting, and load scripts.
- **Risk:** critical launch-readiness gap.

## Proposed Solution

1. **implemented (design):** define preconditions, test accounts, rollback
   authority, evidence fields, and secret-redaction rules.
2. **implemented (design):** exercise top-up/webhook, paid inference,
   backup/restore, alert delivery, and bounded load in a disposable or approved
   hosted environment.
3. **implemented (design):** attach timestamps, request ids, outcomes, and
   unresolved blockers to the launch master; never invent operator approval.

## Verification Gates

- `npm run verify`
- `npm run test:http`
- `npm run test:recovery`
- `npm run test:load`
- operator-run external acceptance receipt

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** fixture-green does not equal real-service acceptance.
- **GREEN:** the receipt contract covers money, inference, recovery, alerts,
  load, rollback, and explicit approval boundaries.
- **AUDIT:** cross-checks existing FIDs 043, 060, 062 and the declared scripts.
- **ADVERSARIAL:** expired webhooks, duplicate events, restore drift, alert
  silence, rollback failure, and load saturation remain visible.
- **CHANGE DELTA:** 8%; converged.

### Missed Questions

1. **Can the agent approve launch?** No; release approval remains operator-owned.
2. **Can live secrets enter the receipt?** No; values are replaced by redacted
   fingerprints or presence checks.

## Implementation Evidence

- **Commit SHA:** `35c1d35`.
- **Implementation:** `lib/launch-receipt.ts` defines six required observations
  (`payment`, `inference`, `recovery`, `alert`, `load`, `rollback`), validates
  timestamps, operator, evidence and an explicit go/no-go pinned to the running
  SHA, and rejects configured secret values or credential shapes by JSON path.
  `scripts/launch-receipt.mjs` (`npm run receipt:launch`) never creates a
  receipt; a missing file, failed item, stale SHA or no-go exits 1.
- **Documentation:** `docs/launch-receipt.md` records the file shape, evidence
  boundary and redaction rules.
- **Tests Added:** Yes — `tests/launch-receipt.test.mjs` (7 cases) covers pass,
  incomplete, blocked, stale, leak, environment-value detection and schema.
- **Gate output:** `npm run receipt:launch` exits 1 with INCOMPLETE and lists all
  six missing items. `npm run check`, 956 tests (955 pass, 1 skipped, 0 fail),
  quality and build pass at `35c1d35`.
- **Why the status is fixed, not closed:** no external observation and no
  operator approval exists. The mechanism is ready; the receipt is not.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** receipt contract and validator implemented at `35c1d35`.
- **Next action:** the operator performs the six observations, writes
  `dev/acceptance/launch-receipt.json` and runs `npm run receipt:launch` against
  the pinned release SHA. Launch remains no-go until then.
- **Archived:** no.
