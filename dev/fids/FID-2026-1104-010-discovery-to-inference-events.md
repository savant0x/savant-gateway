# FID: Discovery-to-inference business events

**Filename:** `FID-2026-1104-010-discovery-to-inference-events.md`
**ID:** FID-2026-1104-010
**Severity:** medium
**Status:** converged
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The existing activity authority records account and money lifecycle events, but
nothing measures the product funnel from content discovery to a successful model
request. Follows, saves, content-to-model clicks and first successful requests
are either unrecorded or indistinguishable in the current vocabulary, so product
decisions rest on opinion.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; PostgreSQL.
- Repository HEAD `aef6730`.
- Baseline: release audit finding 13.

## Detailed Description

### Problem

`lib/storage/store/activity.ts` and `lib/storage/ledger/activity.ts` write
`activity_events` with `kind`, `entity_type`, `entity_id` and bounded metadata.
The recorded kinds cover account, key, credit and payment lifecycle. There is no
event for a first successful completion, a content-to-model click, a new follow,
a save, or a return to the briefing, so the audit's proposed funnel cannot be
measured without ad-hoc queries.

### Expected Behavior

A small, privacy-reviewed vocabulary that measures discovery to inference using
the existing table and writer, with bounded metadata, no prompt or key content,
and an operator-readable aggregate. Events are additive; no backfill is claimed.

### Root Cause

The event authority grew around money and account safety. Product measurement was
never given a vocabulary, so every new question required a schema decision.

### Evidence

```text
lib/storage/store/activity.ts     recordActivity / recordActivityBestEffort
lib/storage/ledger/activity.ts    transactional insert
lib/storage/schema/customers.ts   activity_events columns and indexes
release audit finding 13          funnel events absent
```

## Impact Assessment

### Affected Components

- `lib/storage/store/activity.ts`, `lib/storage/ledger/activity.ts`.
- Gateway success path, content article and model-link surfaces, follow/save
  routes, briefing read path.
- Admin analytics read surface.

### Risk Level

- [x] Medium: product decisions remain unmeasured; privacy risk if metadata is
  unbounded.

## Proposed Solution

1. Define five kinds with a fixed metadata shape: `first_completion`,
   `content_model_click`, `follow_created`, `save_created`, `briefing_return`.
   Reuse the existing `activity_events` table; do not add a table.
2. Emit at the existing success points, after the transaction that proves the
   action. `first_completion` is written once per user, keyed by a durable
   marker, not by a client claim.
3. Keep metadata bounded: model id, content id, group slug. Never store a
   prompt, completion, key, email or IP.
4. Add an operator aggregate (counts by day and kind) and document the event
   meanings. Retention follows the existing FID-2026-1031-079 decision; this FID
   does not invent a new retention window.

### Verification

RED: no rows exist for the five kinds after the named journeys. GREEN: each
journey writes exactly one row with the expected bounded metadata, a duplicate
request writes no second `first_completion`, and no prompt or key text appears.
Aggregate counts match the fixture.

### YAGNI

Five kinds, one table, one aggregate. No analytics vendor, no client SDK, no
session replay, no new personal data.

## Verification Gates

- gate: test tests/activity.test.mjs
- gate: test tests/content-reactions.test.mjs
- gate: test tests/content-store.test.mjs
- gate: lint, typecheck, quality, build.
- gate: test_http — `npm run test:http`.
- gate: verify — `npm run verify:supabase`.

**Planned artifact:** cases extend the named existing files; all three paths
exist. No new test file is promised at convergence.

### Verification Receipt

- verified: not yet — design converged, implementation pending.

## Perfection Loop

### Loop 1 — RED

- **RED:** no funnel vocabulary; account/money events only.
- **GREEN:** five kinds on the existing authority with bounded metadata.
- **AUDIT:** the table and both writers exist; the schema already indexes `kind`.
- **ADVERSARIAL:** `first_completion` can be forged by replaying a request or
  racing two successes. Use a unique durable marker per user.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Does this require a new table?** No; the existing table and indexes cover
   the vocabulary.
2. **Can it store the prompt to identify a workflow?** No. Prompts are private
   input and are never event metadata.
3. **What about anonymous visitors?** Content-to-model clicks can be counted
   without an identity, or omitted; do not create a shadow profile.
4. **Does this replace revenue analytics?** No; it adds funnel events beside the
   existing money events.

### Loop 2 — Independent audit and self-correction

- **RED:** an event written inside the request transaction can roll back a
  successful completion if the insert fails.
- **GREEN:** write best-effort after the success is durable, except where the
  event is part of the business record.
- **AUDIT:** `recordActivityBestEffort` exists for exactly this case.
- **ADVERSARIAL:** best-effort writes can be lost under pressure; the aggregate
  must state that it is a lower bound, not an exact count.
- **CHANGE DELTA:** 4%.

### Loop 3 — Final convergence

- **RED:** a new kind could be added without a documented meaning.
- **GREEN:** the vocabulary is a typed union with one comment per kind and a
  test that rejects unknown kinds at the writer boundary.
- **AUDIT:** no client-supplied kind is accepted.
- **ADVERSARIAL:** retention could delete the only funnel evidence; the existing
  retention decision must be recorded before enabling pruning.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Pending. Coding is reserved to the operator's separate worker.

- [ ] Commit SHA, file ranges, gate output, step statuses.
- [ ] Journey-to-event receipt.

## Code Verification Evidence

- [x] Table, writers and indexes were inspected.
- [x] Status reflects reality: `converged`.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Next action:** worker implements the vocabulary, emitters and aggregate;
  operator approves the metadata boundary and retention reference.
- **Archived:** no.

## Lessons Learned

An event vocabulary is a privacy decision as much as a measurement decision.
Define what must never be stored at the same time as what must be counted.
