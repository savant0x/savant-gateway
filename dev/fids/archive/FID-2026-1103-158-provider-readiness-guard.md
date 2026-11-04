# FID: Provider readiness guard and diagnostics surfacing

**Filename:** `FID-2026-1103-158-provider-readiness-guard.md`
**ID:** FID-2026-1103-158
**Severity:** high
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one pure readiness rule reused by two write
routes and diagnostics.

## Summary

A provider can be saved as `enabled: true` while its key environment variable is
absent from the running deployment. The registry then advertises a provider that
cannot serve; CommandCode reached Production in exactly that state. The provider
write routes must refuse an enabled save when this runtime cannot see the key,
and diagnostics must name the providers that are enabled but not ready.

## Environment

- **OS:** win32
- **Language/Runtime:** Node 22.x, TypeScript strict
- **Commit/State:** `b8bbd19` plus the working tree
- **Evidence:** hosted diagnostics at `b8bbd19` reported CommandCode enabled with
  no `COMMANDCODE_API_KEY`.

## Detailed Description

### Problem

`readProviderInput` defaults `enabled` to true and neither `POST
/api/admin/providers` nor `PATCH /api/admin/providers/[slug]` checks whether the
named variable is present. The provider status becomes `unconfigured`, but the
record still claims to be enabled and catalog sync can publish unusable rows.
Diagnostics lists keys but treats "enabled, key missing" as a warning rather than
a readiness state, so the guard has no shared vocabulary.

### Expected Behavior

1. Saving a provider as enabled succeeds only when this runtime sees a non-blank
   value for its key variable.
2. A refused save returns a stable, actionable message naming the variable and
   the redeploy step; it never includes a value.
3. Diagnostics reports a readiness state per provider (`ready`, `disabled`,
   `blocked`) with the blocked variable names, and the Providers panel disables
   the Enable button for a provider whose key is missing.

### Root Cause

The write path validates the shape of the record but not the runtime prerequisite
for serving; diagnostics had presence but no enablement decision.

### Evidence

```text
app/api/admin/providers/[slug]/route.ts: updateProvider(slug, input.value) with no key check
lib/providers/registry.ts: enabled: input.enabled !== false
app/admin/(panel)/diagnostics/page.tsx: missingEnabled is display-only
```

## Impact Assessment

### Affected Components

- `lib/providers/registry.ts`, `lib/deployment-diagnostics.ts`
- `app/api/admin/providers/route.ts`, `app/api/admin/providers/[slug]/route.ts`
- `app/admin/(panel)/diagnostics/page.tsx`, `components/admin/providers-panel.tsx`
- `tests/provider-readiness.test.mjs`, `tests/deployment-diagnostics.test.mjs`

### Risk Level

- [x] High: a provider that cannot serve was enabled in Production.

## Proposed Solution

### Approach

One pure rule in the provider registry: `providerReadiness({ keyEnvVar, enabled,
env })` returns `ready | disabled | blocked`, the presence flag and a
secret-free reason. `providerEnableRefusal` turns `blocked` into the operator
message. Both write routes call it after validation. Diagnostics and the panel
consume the same states.

### Steps

1. Add `providerReadiness` and `providerEnableRefusal` to
   `lib/providers/registry.ts`.
2. Guard `POST` and `PATCH` with a 409 and the refusal message.
3. Extend `ProviderKeyState` with `readiness` and `reason`; expose
   `enabledUnready` variable names.
4. Render readiness in diagnostics and disable the Enable button when the
   provider is not configured, with the variable name shown.
5. Test readiness, refusal text, diagnostics states and non-leakage.

### Verification

- `node --test tests/provider-readiness.test.mjs tests/deployment-diagnostics.test.mjs`
- `npm run check`, `npm run quality`, `npm run build`
- HTTP suite provider checks remain green; a live hosted diagnostics page after
  deployment reports the real states.

## Verification Gates

- gate: test tests/provider-readiness.test.mjs
- gate: test tests/deployment-diagnostics.test.mjs
- gate: lint
- gate: typecheck
- gate: quality
- gate: build
- gate: http suite

### Verification Receipt

- verified: 2026-11-03
- test tests/provider-readiness.test.mjs: exit 0 (5/5)
- test tests/deployment-diagnostics.test.mjs: exit 0 (3/3)
- lint: exit 0 (zero errors; six pre-existing warnings in `lib/launch-receipt.ts`)
- typecheck: exit 0
- quality: exit 0 (400-line ceiling)
- build: exit 0 (part of the full verify run)
- http suite: PASS (full verify gate)
- full verify through FID-159: all ten gates PASS, 976/976 unit tests, 0 skipped

## Perfection Loop

### Loop 1 — RED

- **RED:** enabled-without-key is accepted by the registry API and only surfaces
  as a warning after the fact.
- **GREEN:** shared readiness rule, 409 refusal in both write routes, diagnostics
  readiness states and a disabled Enable control on the panel.
- **AUDIT:** the refusal runs on the merged PATCH record, so a toggle and a full
  form save are both covered; a disabled save is never blocked. Diagnostics
  reports `ready | disabled | blocked` and names blocked variables. The existing
  HTTP provider-edit check remained green because its fixture key is present.
- **ADVERSARIAL:** whitespace value stays unconfigured; empty variable name gets
  a generic reason; the refusal names no value; the panel cannot start an enable
  that the API would refuse.
- **CHANGE DELTA:** 9%; converged.

### Loop 2 — Independent audit and self-correction

- **RED:** the initial diagnostics badge could have shown a disabled provider
  with a missing key as a failure.
- **GREEN:** readiness separates `disabled` from `blocked`, so only an enabled
  record claiming service is red.
- **AUDIT:** `tests/provider-readiness.test.mjs` and
  `tests/deployment-diagnostics.test.mjs` pass 8/8 combined.
- **ADVERSARIAL:** a provider already enabled without a key can still be
  disabled or repaired by naming a configured variable; the guard does not lock
  the record.
- **CHANGE DELTA:** 3%; converged.

### Missed Questions

1. **Does the guard prove the key works upstream?** No. It proves this runtime
   can see a value. Provider Test remains the upstream proof; the FID and UI say
   which claim each check makes.
2. **Should the guard block disabling or renaming?** No. It only refuses a write
   that leaves the provider enabled without a visible key.
3. **What about a local `.env.local` key?** The guard reads `process.env` in the
   running process, so it matches the deployment that would serve the call, not
   the developer's shell.

## Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `261ce53` (implementation slice); closure evidence in the
  following commit.
- [x] **File:line ranges:** `lib/providers/registry.ts:228`
  (`providerReadiness`), `:261` (`providerEnableRefusal`);
  `app/api/admin/providers/route.ts:43` and
  `app/api/admin/providers/[slug]/route.ts:43` (409 guard);
  `lib/deployment-diagnostics.ts:79` (readiness projection);
  `app/admin/(panel)/diagnostics/page.tsx` (readiness chips and banner);
  `components/admin/providers-panel.tsx` (Enable disabled without a key).
- [x] **Gate output:** focused 8/8; lint 0 errors; typecheck 0; quality PASS;
  full verify all ten gates PASS, including the HTTP suite, 976/976 unit tests.
- [x] **Reproducibility:** `rg "providerEnableRefusal" app lib` finds both write
  routes and the rule; `rg "enabledUnready" lib app` finds the diagnostics path.
- [x] **Step statuses:** steps 1–5 `implemented`. The hosted page observation
  follows the deployment of this commit; the code path is build- and
  HTTP-gated, not browser-clicked in this session.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** provider saves that would leave a provider enabled without
  a key visible to the running process are refused with a named 409; diagnostics
  reports `ready | disabled | blocked`, names blocked variables, and the panel
  prevents the Enable action.
- **Tests Added:** `tests/provider-readiness.test.mjs` (readiness, refusal,
  non-leakage) and two new deployment-diagnostics assertions.
- **Verification Evidence:** commit `261ce53`; focused 8/8; full verify all ten
  gates PASS, 976/976 unit tests, HTTP suite green. The hosted diagnostics
  observation follows the deployment of this commit; the page remains
  build-gated and its data path is unit-tested.
- **Archived:** 2026-11-03 — `dev/fids/archive/FID-2026-1103-158-provider-readiness-guard.md`.

## Lessons Learned

Enablement is a runtime claim. Validate it where the runtime can answer, not
where the form was submitted.
