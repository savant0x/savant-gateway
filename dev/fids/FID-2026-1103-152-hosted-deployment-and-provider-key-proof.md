# FID: Hosted deployment and provider-key proof

**Filename:** `FID-2026-1103-152-hosted-deployment-and-provider-key-proof.md`
**ID:** FID-2026-1103-152
**Severity:** critical
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Vercel is the deployed runtime and GitHub is its source. Local `.env.local`
values do not prove that Preview or Production has the required upstream
provider variables. This FID verifies the remote commit, Vercel deployment,
runtime key-presence diagnostics, provider tests, and provider sync without
printing or copying secrets.

## Proposed Solution

1. Confirm the local branch, remote branch, unpushed commits, and working tree;
   preserve the untracked handoff file until its disposition is explicit.
2. Push only the verified intended commits through the normal Git workflow and
   record the remote commit.
3. Confirm Vercel Ready status and deployed commit/branch from the dashboard or
   deployment API; do not infer it from local Git.
4. Check Preview and Production environment-variable presence through Admin →
   Diagnostics; values and hashes are never recorded.
5. Run provider Test and Sync on the deployed runtime and record counts/statuses.
6. Produce a redacted deployment receipt and reconcile any mismatch as a
   concrete failure, not an assumption.

## Verification Gates

- `npm run attribution`
- `npm run check`
- `npm run test:http`
- `npm run build`
- `npm run receipt:deploy`
- hosted Admin Diagnostics and provider Test/Sync receipt

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** local key presence and local commit state do not prove hosted state.
- **GREEN:** the workflow compares GitHub, Vercel, runtime diagnostics, and
  provider behavior with redacted evidence.
- **AUDIT:** verify `scripts/deployment-receipt.mjs`, Admin Diagnostics, provider
  routes, and Vercel build output are all on the production call graph.
- **ADVERSARIAL:** wrong branch, stale deployment, missing Preview-only key,
  key in the wrong environment, provider sync failure, and secret leakage fail.
- **CHANGE DELTA:** 8%; converged.

### Loop 2 — Independent audit

- **RED:** a successful provider sync could still be from a stale deployment.
- **GREEN:** the receipt pins deployment commit before provider actions.
- **AUDIT:** compare the hosted commit with GitHub and the local intended commit.
- **ADVERSARIAL:** a Ready deployment with an old commit is not accepted.
- **CHANGE DELTA:** 3%; converged.

### Loop 3 — Final convergence

- **RED:** no additional design issue found.
- **GREEN:** all external observations are explicit and redacted.
- **AUDIT:** every step has an evidence field and no secret field.
- **ADVERSARIAL:** the FID claims no hosted success before observation.
- **CHANGE DELTA:** 1%; converged.

### Missed Questions

1. **Can local `.env.local` be uploaded?** No; configure Vercel directly.
2. **Can a provider test use real paid traffic?** No; use its safe test/sync path.

## Implementation Evidence

- **Commit SHA:** none; planning contract only.
- **Step statuses:** all six steps are `implemented (design)`.
- **Archived:** no; remains active until the hosted receipt exists.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
