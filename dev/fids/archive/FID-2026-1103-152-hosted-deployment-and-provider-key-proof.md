# FID: Hosted deployment and provider-key proof

**Filename:** `FID-2026-1103-152-hosted-deployment-and-provider-key-proof.md`
**ID:** FID-2026-1103-152
**Severity:** critical
**Status:** closed
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

- **Commit SHA:** planning and convergence `b2b9ef5`; implementation and chart
  report `7e24f0e`.
- **Step 1 implemented:** local `main` was compared with `origin/main` before each
  push. The untracked client chat export
  `freebuff-chat-2026-11-03T12-54-56.217Z.md` was preserved and not committed.
- **Step 2 implemented:** both slices were pushed through the real pre-push gate
  using a disposable database. GitHub `main` is
  `7e24f0e152b6dbe273dec83332a1dff3d19a46d2`; the remote ref was re-read after the
  push.
- **Step 3 implemented:** the Vercel deployment list reported the production
  deployment `savant-gateway-1kqrm056c-savantai.vercel.app` `READY` on branch
  `main` at commit `7e24f0e152b6dbe273dec83332a1dff3d19a46d2`. Admin Diagnostics
  independently reported runtime `production`, Vercel environment `production`,
  repository `savant0x/savant-gateway`, commit `7e24f0e`, branch `main`, public
  origin `https://savant-gateway.vercel.app`, and a successful storage read.
- **Step 4 implemented:** hosted Diagnostics reported `PROVIDER_KEY` configured
  for Savant, `COMMANDCODE_API_KEY` missing for the enabled CommandCode provider,
  and Apixo disabled with its key missing. Presence only; no value is recorded.
- **Step 5 implemented:** hosted Savant Test returned `200` with 44 models. Hosted
  Sync returned `200`, imported 44 models (11 free, 23 paid, 10 subscription-only),
  zero warnings, balance `$0`, 15 rpm on the `free` plan, and 19,458,089 tokens
  remaining on the upstream free allowance.
- **Step 6 implemented:** redacted receipts are
  `dev/receipts/2026-11-03-sandbox/deployment.md`, `hosted-diagnostics.txt`,
  `hosted-provider.txt`, `deployment-local.json` and `verify.log`. The local
  receipt's own `clean: false` and provider flags are explicitly labelled as
  local-state notes, not hosted evidence.
- **Gates:** `npm run attribution` PASS, `npm run check` exit 0 (zero errors; six
  pre-existing warnings in untouched `lib/launch-receipt.ts`), `npm run
  test:http` PASS (802 main checks plus the trial suite), `npm run build` exit 0,
  `npm run receipt:deploy` exit 0, and full `npm run verify` PASS.
- **Open limitation:** CommandCode is enabled in Production without its key. It
  publishes zero models and cannot serve. The operator must add the key to
  Production and Preview and redeploy, or disable the provider; this FID did not
  change production configuration.
- **Archived:** yes — moved to `dev/fids/archive/` after the final receipt.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** the intended commits are on GitHub and the hosted Vercel
  production deployment was independently matched by commit, branch, runtime
  diagnostics, provider test and provider sync, with a redacted receipt.
- **Verification Evidence:** `deployment.md`, `hosted-diagnostics.txt`,
  `hosted-provider.txt`, Vercel deployment `READY` at `7e24f0e`, and the full
  `verify` receipt.
- **Archived:** yes.
