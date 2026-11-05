# FID: Complete linked-content management and controlled rematching

**Filename:** `FID-2026-1104-017-content-matching-controls-and-review.md`
**ID:** FID-2026-1104-017
**Severity:** medium
**Status:** converged
**Created:** 2026-11-04 23:20 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Provide a complete operator inventory of content/model associations, explicit
matching controls and a durable job that can rematch stored items without
refetching publishers. Use FID-016's decision authority and FID-015's scheduler
and history conventions. This contract is design-only under FID-2026-1104-018.

## Environment

- Windows/PowerShell, Node v24.21.0; Next.js 16.4.3; PostgreSQL/PGlite.
- Grounding HEAD `f6d2a5b`; SCOPE CA3; coding explicitly reserved.
- Current models are exact catalog ids, with distinct billing SKUs.

## Detailed Description

### Problem

Only the latest 15 created links are shown. There is no complete auto-link
inventory, no matching settings, no explicit acceptance or stored-item rematch.
An old article falling out of a source's bounded feed window is never revisited
merely because a new catalog model or alias was added.

### Expected Behavior

One browsable page shows every matching record with a clear state, source,
content and exact model. Controls explain when matching runs and what inputs it
uses. Operators can rematch a known stored-content scope, monitor progress and
review results without disturbing accepted/dismissed decisions.

### Root Cause

The admin surface uses `listRecentLinks(db, 15)` without filters or paging.
Matching is hardcoded inside ingestion; there is no catalog/settings trigger
or persisted rematch cursor. Topic tags and model associations are not explained
as distinct concepts in the workflow.

### Evidence

- `app/admin/(panel)/content/page.tsx:58`: `listRecentLinks(db, 15)`.
- `lib/content/store/links.ts:253`: ordered by creation time, capped at 100;
  refresh does not move an old association into the recent list.
- `lib/content/ingest.ts:194`: match every returned item after upsert, on every
  fetch; `replaceAutoLinks` persists suggestions. No change-hash gate skips it.
- `lib/content/linking.ts:154`: normalized title-token sequence or exact tag
  match; model id/name/upstream-id aliases; no fuzzy matching or body classifier.
- `lib/content/linking.ts:186`: matcher labels its own suggestion reviewed.
- `lib/content/store/items.ts`: models are active/in-catalog rows, whereas public
  item detail resolves links through the public catalog, creating visibility
  differences that must remain explicit.
- `lib/content/taxonomy.ts`/`feed-xml.ts`: normalized publisher categories and
  operator source tags; some adapters/enrichment supply additional tags.
- Caller search finds no matching invocation in provider catalog sync.
- Direct pure-matcher experiment: title `GPT-6 Luna Fast launch` yields both
  `gpt-6-luna` and `gpt-6-luna-fast`; the shorter sibling currently overmatches.

## Impact Assessment

### Affected Components

Admin content layout/navigation and link form/actions; matcher and taxonomy
explanations; guarded matching/settings/job APIs; shared settings; content
matching schema/stores/runner; catalog-change invalidation and public callers
already covered by FID-016. No model-routing or billing-identity change.

Planned files: `lib/content/matching-policy.ts`, `lib/content/rematch.ts`,
`lib/content/store/matching.ts`, `lib/content/store/rematch.ts`,
`lib/storage/schema/content-matching.ts`,
`app/admin/(panel)/content/links/page.tsx`,
`app/api/admin/content/matching/route.ts`, and
`app/api/admin/content/rematch/route.ts`. Extend the existing links GET with
filtered pagination when itemId is absent; keep its itemId contract. Settings
use GET/PATCH; rematch uses GET for preview/status, POST for start/retry and
PATCH for cancellation. GET preview never creates a job or writes a decision.

### Risk Level

- [x] Medium: operators cannot inspect the full state or control reprocessing.
- Risks: broad aliases, hidden accepted links, fake confidence labels, runaway
  backfills, racing settings, public pending leaks and silent SKU conflation.

## Proposed Solution

### Approach

1. Add `/admin/content/links`, linked from the existing content dashboard.
   Reuse its authenticated shell and UI primitives. Tabs: all active, suggested,
   automatic, accepted, dismissed and retired; accepted remains an inventory,
   never disappearing just because activity ages. Filters: exact model id,
   source, kind, relation, title search and date range. Bounded keyset pagination
   (50/page, max 100), stable `(created_at, item_id, model_id)` cursor and
   count/empty states. Scope counts use the same filter as rows.
2. Each row links to content detail and the qualified model SKU; show match
   reason, evidence type, detection/decision times, publication state and latest
   observation. Expand for decision history. Accept/Dismiss/Restore call FID-016,
   with visible inline errors, conflict refresh, keyboard labels and optimistic
   updates only after acknowledged persistence. Do not use a transient log as
   the inventory. Keep a small recent-activity preview on the overview.
3. Version matching policy in the existing settings store: enabled (default
   true), publication mode `review_required | automatic` (default review_required
   for new detections), title matches enabled, exact-tag matches enabled, and
   automatic catalog-change rematch enabled (default true). Invalid policy fails
   closed for new publication and displays a configuration error. Turning matching
   off pauses detection/rematch and leaves accepted/dismissed records untouched;
   it does not erase prior published links. Changes affect future observations,
   not historical acceptance. Legacy published links migrate as FID-016 specifies.
   Still-matching legacy auto-published links stay published; review-required
   mode does not silently demote them. New detections start suggested. Explicit
   automatic mode may publish eligible suggestions, never dismissed pairs.
4. Add model-scoped custom aliases and alias enable/disable to supplement the
   existing generated aliases. Reuse tokenizer, normalization and version
   precision constraints; default aliases still require two tokens and a version.
   Reject generic/family-only or ambiguous aliases for automatic publication.
   An operator-provided alias lacking a version may be used only for suggestions,
   never unattended publication, with explicit ambiguity evidence. Cross-SKU
   exact identity can yield independent pairs; genuinely different versions with
   an overlapping alias require review. Prefer longest specific alias evidence
   per occurrence so a suffixed sibling does not imply the shorter model, while
   a separate explicit mention of the base model still produces its own match.
5. Preserve the current literal matcher as the shared engine. Title matches
   and tag matches are evidence categories; existing 1/0.85 scores are rule
   weights, not calibrated correctness probabilities. UI labels must say this.
   No paid LLM, fuzzy classifier, family-wide automatic fanout or routing identity
   folding. Topics remain normalized source/publisher/adapter tags; this work
   does not claim semantic topic auto-classification or manual per-item topic
   persistence that is not implemented. Source tag edits take effect on refetch;
   rematch uses the already stored topic tags.
6. Add an admin rematch preview/start action with explicit scope (all stored
   content, source, model, or date range), count and policy version. Persist a
   job, materialized selected item ids, source filters, deterministic cursor,
   policy version/hash and exact matching catalog/alias snapshot, counters,
   failure details and operator provenance. Idempotency key prevents accidental
   duplicate submissions. No publisher/network fetch is needed for rematching.
   Capture membership in a bounded database transaction with statement timeout;
   failure rolls back and is visible. Do not use hash item ids as a chronological
   high-water mark. Reconciliation honors exact model scope per FID-016.
7. Drain jobs in bounded scheduler batches using database owner leases, fenced
   writes, transaction checkpoints, resumable per-item outcomes and cancellation
   between items. Reuse FID-015 scheduling/budget utilities, not another timer.
   When jobs are pending, allocate 35 seconds of a 45-second tick to fetching
   and reserve the remaining 10 for rematch. Repeated failures on one item are recorded
   and do not prevent cursor progress; failed items have an explicit retry scope.
   Job cancellation preserves committed decisions and completed work.
8. One successful catalog change or alias/policy revision marks the matching
   inventory dirty in the same database transaction as the authoritative change.
   The tick detects dirty revision and coalesces a job when automatic rematch is
   enabled. A stopped process cannot lose the invalidation. When disabled, show
   pending dirty state and offer manual start; do not silently claim current
   coverage. Existing items beyond feed windows are included. No full scan in a
   sync request or page render. Inventory-changing events are not inferred from
   total model counts, which miss equal-sized catalog replacements.
   Revision changes compare matching inputs (exact ids, names, aliases,
   eligibility), not price or sync timestamps; unchanged syncs enqueue nothing.
9. Record `last_matched_at`, policy/catalog versions and match status per item,
   including successful zero-match outcomes. Any error is distinct from zero.
   Compare pinned job revisions to current revisions before each write: if newer
   matching input or a newer item content version exists, do not commit stale
   automatic observations; mark/requeue the item for the latest job. FID-016's
   item lock/version protects accepted/dismissed decisions independently.

Source filters use the item's existing canonical owning source; merging multiple
feeds does not invent a new source-membership graph. A model-filtered inventory
shows unavailable/deleted catalog references with preserved ids and decisions.

### Steps

1. **blocked — coding reserved:** matching settings/aliases, validators and
   shared literal engine with overlap/ambiguity handling.
2. **blocked — coding reserved:** complete link inventory API/page and actions.
3. **blocked — coding reserved:** durable rematch store/runner and policy snapshots.
4. **blocked — coding reserved:** catalog/settings invalidation and scheduler drain.
5. **blocked — coding reserved:** behavioral, race, HTTP and browser verification.

### Verification

Planned `tests/content-match-management.test.mjs`: >100 links with accepted
entries older than the recent preview; all filters/cursors/counts; invalid
settings; title-only/tag-only/off policy; qualified SKUs; ambiguous custom aliases;
no-version rule; suffix sibling exclusion; policy version changes.
Planned `tests/content-rematch.test.mjs`: stored old item discovers a new model
without network, pinned snapshots, stale content/revision refusal, >50 items
across ticks, restart/claim expiry, duplicate start, item failures/retry, pause/
cancel, coalesced dirty revisions and accepted/dismissed persistence.
Extend real HTTP checks for authorization, validation, all-state inventory,
Accept/Dismiss/Restore, job lifecycle and public visibility. Browser receipt:
keyboard-only filter/review/rematch, 320/1024 widths, both themes, visible errors,
history and an accepted link after reload. Use the FID-009 runner if available;
otherwise capture an explicit equivalent receipt, not a claimed dependency pass.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/content-match-management.test.mjs — planned.
- gate: test tests/content-rematch.test.mjs — planned.
- gate: test tests/content-link-decisions.test.mjs — FID-016 planned dependency.
- gate: test tests/content-linking.test.mjs — existing matcher.
- gate: test tests/content-taxonomy.test.mjs — separate topic contract.
- gate: test tests/catalog-skus.test.mjs — distinct catalog products.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, real PostgreSQL/HTTP/recovery included.

### Verification Receipt

Master/session summary hold planning receipts. Planned tests and UI/job behavior
are not implemented or verified in this pass.

## Perfection Loop

### Loop 1 — RED

- **RED:** capped created-order preview cannot be a persistent inventory; fetch
  matching has no settings or catalog-triggered stored-item backfill.
- **GREEN:** full inventory, bounded versioned controls and durable rematching,
  all using FID-016 decisions and FID-015 execution.
- **AUDIT:** traced existing matcher, item/tag writes, model eligibility, link
  API/page and public detail/coverage consumers; baseline suites 55/55.
- **ADVERSARIAL:** historical accepted link ages out; stale job overwrites new
  settings; generic alias matches every version; new SKU conflates paid/free;
  frequent catalog sync prevents a large job from ever finishing.
- **CHANGE DELTA:** initial design; measured passes recorded after review.

### Missed Questions

1. Does matching run after initial import only? No; today it runs per item on
   every source fetch. New design retains that trigger plus stored-item rematch.
2. Does changing source tags reclassify old content immediately? No; refetch
   updates stored tags. Rematch recomputes associations from stored inputs only.
3. Does editing a rule remove accepted links? Never; FID-016 is authoritative.
4. Can the dashboard change the hosting cron expression at runtime? No; it
   configures job policy inside the fixed deployment heartbeat from FID-015.
5. What if input revisions keep changing? Coalesce changes by dirty revision;
   complete valid items, reject stale writes and expose queue age/backlog.

### Implementation Evidence (REQUIRED for `closed`)

All five implementation steps are blocked by the operator's planning-only
instruction. No application/schema/UI code, implementation commit or closure.

### Code Verification Evidence

Existing store/matcher/page evidence is above. Future reachability requires
dashboard → guarded job/settings APIs → durable stores; cron → rematch runner
→ shared matcher/reconcile; catalog writes → durable dirty revision. Zero
production callers rejects implementation closure.

### Loop 2 — Independent audit and self-correction

- **RED:** hash ids are not chronological; fetch-first budgeting could starve
  rematch; global longest-alias filtering would suppress explicit base mentions.
- **GREEN:** materialized job membership, 35s/10s budget split, occurrence-local
  longest evidence and exact-model reconciliation scope.
- **AUDIT:** pure-matcher experiment returns both base/suffixed ids for the
  suffixed title; current matcher/store call graph is cited in Evidence.
- **ADVERSARIAL:** stale policy/content revisions cannot publish; zero matches
  and failures differ; accepted and dismissed decisions remain authoritative.
- **CHANGE DELTA:** first correction 609/13415 characters (4.540% Levenshtein).

### Loop 3 — Final convergence

Final audits must confirm complete inventory, precise aliases, bounded jobs,
durable invalidation and operator decisions. Two final unchanged-document
passes and their hashes/deltas are recorded in the planning session receipt.

## Resolution

Design-only, no closed/archive date or implementation SHA. Build/test receipts
for existing code do not verify this future management feature.

## Lessons Learned

Inventory, detection, publication and review are different operations. Stable
operator decisions must outlive activity windows and automatic reprocessing.
