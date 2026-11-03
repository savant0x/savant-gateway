# FID: Gateway model retrieve and documentation truth

**Filename:** `FID-2026-1103-124-gateway-model-retrieve-and-docs-truth.md`
**ID:** FID-2026-1103-124
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03 10:45
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

`/v1/models` lists published models but there is no `GET /v1/models/{id}`,
which some OpenAI-compatible clients call. Separately, the API reference does
not say which sampling fields are forwarded, translated or ignored for the two
wire protocols; the Anthropic adapter silently drops `response_format`, `seed`,
`logprobs`, `n` and `parallel_tool_calls`. The repository map in `AGENTS.md`
still names three gateway modules that no longer exist, and
`docs/project-status.md` describes a queue that has since been closed.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

- Only `GET /v1/models` exists.
- The Anthropic translation layer has no documented parameter contract.
- `AGENTS.md` lists `lib/gateway.ts`, `lib/gateway-stream.ts`,
  `lib/gateway-settle.ts`; the code lives under `lib/storage/gateway/` and
  `lib/gateway-*.ts`.
- `docs/project-status.md` still calls 043/044/062/066/068 the active queue.

### Expected Behavior

- `GET /v1/models/{id}` returns the OpenAI model object for a published id, or
  a `model_not_found` error, with the same CORS policy as the list.
- The API reference states the forwarding/translation rules per provider kind.
- Repository layout docs match the tree.
- The status document is marked superseded instead of silently stale.

### Root Cause

The gateway shipped the required list endpoint and the adapters' differences
were left implicit; documentation drifted as modules moved.

### Evidence

```text
app/v1/models/route.ts: GET list only
lib/providers/anthropic-request.ts: no response_format/seed/logprobs/n
AGENTS.md: lib/gateway.ts, lib/gateway-stream.ts, lib/gateway-settle.ts
docs/project-status.md: "active queue is five records: 043, 044, 062, 066, 068"
```

## Impact Assessment

### Affected Components

- `app/v1/models/[id]/route.ts` (new)
- `lib/catalog-pairs.ts` or the catalog façade for the public model shape
- `components/docs/api-reference.tsx`
- `AGENTS.md`, `docs/project-status.md`
- `tests/model-retrieve.test.mjs` (new)

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a wrong compatibility claim is worse than no claim
- [ ] Low

## Proposed Solution

### Approach

Reuse the published-model projection from the list endpoint so the retrieve
route cannot expose an unpublished or disabled row. Document only behaviour the
adapter code actually performs. Correct the layout map and mark the status page
superseded with a dated banner rather than rewriting its history.

### Steps

1. Extract the public model object builder used by the list route.
2. Add `GET /v1/models/[id]` with `model_not_found` and CORS.
3. Add a parameter compatibility table to the API reference.
4. Correct `AGENTS.md` paths.
5. Add a superseded banner and current-ledger pointer to `project-status.md`.
6. Test the builder and the not-found case.

### Verification

`tests/model-retrieve.test.mjs` covers the projection and 404; `next build`
proves the route; docs changes are reviewed against the adapters.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-retrieve.test.mjs
- gate: test tests/catalog-pairs.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** No retrieve route, undocumented adapter gaps, stale layout/status.
- **GREEN:** Route, compatibility table, corrected docs.
- **AUDIT:** The route selects only published rows and returns the same object
  shape as the list.
- **ADVERSARIAL:** A client that sends `response_format` to an Anthropic-served
  model still receives prose; the docs must say so plainly until a rejection
  path is implemented.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should unsupported fields be rejected instead of ignored? → That is a
   behaviour change with client breakage; this FID documents the current truth.
   A later FID can add an explicit 400 behind a compatibility switch.
2. Does the retrieve route need auth? → **Corrected during implementation:**
   the list is not public. `/v1/models` requires a Bearer or x-api-key and
   authenticates the key, so the retrieve route uses the same guard. Returning
   an unauthenticated model object would have widened the surface beyond the
   list it mirrors.
3. Should project-status be rewritten? → No. Its dated receipts are historical;
   a banner and current pointer preserve that record honestly.

### Loop 2 — implementation

- **GREEN:** `lib/openai-model.ts` holds the one model projection, the API-key
  guard, the published-row lookup and the `model_not_found` response. The list
  and catch-all retrieve routes both use it. `GET /v1/models/{id}` accepts a
  literal or encoded `provider/model` id and returns the same object shape.
- **AUDIT:** `findPublishedModel` scans `listModels()`, so disabled rows,
  unpublished rows and models behind a disabled provider are unreachable by id.
  `jsonError` gained an optional `code` parameter; existing callers keep the
  null code they had. The docs now state the per-protocol field behaviour read
  from the adapters rather than the old "forwarded unchanged" claim.
- **ADVERSARIAL:** The FID's original no-auth answer was wrong; the shared guard
  keeps the retrieve surface no wider than the list. The Anthropic path still
  ignores `response_format` and the other fields in the table; the docs say so
  instead of implying an emulation that does not exist.
- **VERIFICATION:** `node --test tests/model-retrieve.test.mjs` 3/3. Full suite
  902 (901 pass, 1 skipped); lint, typecheck, quality PASS (570 files),
  `npm run build` 0 with `/v1/models/[...id]` and all docs pages compiled.
  Commit `d07e039`.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** authenticated OpenAI-compatible model retrieve plus
  truthful adapter and layout documentation
- **Tests Added:** Yes — `tests/model-retrieve.test.mjs`
- **Verification Evidence:** 3/3 focused; `npm test` 902 (901 pass, 1 skipped);
  lint, typecheck, quality and build all exit 0; commit `d07e039`
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

A design question answered from memory rather than from the route is a defect
in the FID. The list required a key all along, so the retrieve route inherited
that requirement; recording the correction is more useful than quietly shipping
a wider surface.
