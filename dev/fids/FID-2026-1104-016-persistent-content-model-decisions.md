# FID: Persistent content-to-model acceptance and dismissal

**Filename:** `FID-2026-1104-016-persistent-content-model-decisions.md`
**ID:** FID-2026-1104-016
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 23:20 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Make explicit operator acceptance a durable association between stored content
and an exact catalog model. Dismissal removes the association from active/public
use and prevents automatic recreation; it does not delete the content. Separate
machine publication from human acceptance, reconcile only machine-owned links,
and use one visibility policy everywhere. Design-only child of FID-2026-1104-018.

## Environment

- Windows/PowerShell, Node v24.21.0, Next.js 16.4.3, PostgreSQL/PGlite.
- Grounding HEAD `f6d2a5b`; SCOPE CA2; explicit planning-only instruction.
- Existing identity is `(item_id, model_id)`, with stable URL-deduplicated items.

## Detailed Description

### Problem

The current table has Dismiss but no Accept action. Matcher output marks itself
reviewed; dismissal deletes a row and re-fetch can reinsert it. The capped recent
table obscures persistent rows. The operator explicitly requires accepted links
to stay attached to content.

### Expected Behavior

Accept once: the exact association remains on the item and model coverage across
refetches, alias/settings/catalog changes, rematches and process restarts.
Dismiss once: remove it from active/public use and refuse automatic resurrection.
Both decisions remain visible in operator history and can be explicitly changed.

### Root Cause

`reviewed` conflates publication and review; there is no durable negative decision,
decision history, or atomic item-level reconciliation. Public consumers do not
share a reviewed/visibility filter.

### Evidence

- `lib/content/linking.ts:186`: `reviewed: true` for every automatic suggestion.
- `lib/content/store/links.ts:89`: `replaceAutoLinks` only loops/upserts the
  current suggestions; it never retires old automatic links that stopped matching.
- `lib/content/store/links.ts:148`: `dismissAutoLink` deletes the automatic row.
- Conflict update protects `relation_source = 'operator'`; manual links already
  survive auto writes, a useful pattern to extend rather than replace.
- `lib/content/store/items.ts:46` and links coverage use `reviewed = 1`.
- `app/signal/[id]/page.tsx:110`: maps `listLinksForItem` output without a
  reviewed filter, allowing a future pending row to leak unless repaired.
- `lib/content/store/item-writes.ts`: upsert by canonical URL retains item id;
  tags are replaced on every fetch independently of model associations.
- Baseline focused suites: 55 pass, 0 fail, 0 skipped; master holds the command.
- In-memory store experiment: `auto_marks_itself_reviewed=true`,
  `after_dismiss=0`, `after_refetch=1`, `after_empty_reconcile=1`,
  `unreviewed_item_links=1 coverage=0`. No publisher or hosted database used.

## Impact Assessment

### Affected Components

Content model-link schema/store/types, matcher handoff in ingestion, admin link
API/actions, item detail, model coverage/counts, model-filtered Signal, briefing
and historical migration. FID-017 consumes these shared decision APIs.

Planned modules: `lib/content/store/link-decisions.ts`,
`lib/content/store/link-events.ts`, `lib/content/store/visible-links.ts`, and
`lib/storage/schema/content-link-decisions.ts`. Extend the existing link route
with PATCH for accept/dismiss/restore and expected revision. Keep POST for manual
link creation; legacy DELETE records durable dismissal rather than deleting the
decision. Split the current link store while preserving its compatibility exports.

### Risk Level

- [x] High: operator decisions can be silently undone and publication can
  misrepresent a machine match as human review.
- Preserve existing published associations during migration; never invent prior
  acceptance, prior dismissal or human identity from a boolean.

## Proposed Solution

### Approach

Keep `content.model_links` as the association authority with additive decision
state, evidence and revisions; add an append-only decision-event table.
Do not duplicate model links in topic tags or use the recent list as storage.

| State | Public association | Who controls it |
| --- | --- | --- |
| suggested | No | Matcher; operator can accept/dismiss |
| auto_published | Yes, labeled automatic in admin | Enabled auto-publish policy |
| accepted | Yes | Explicit operator acceptance/manual creation |
| dismissed | No | Explicit operator decision; durable negative record |
| retired | No | Machine-owned evidence no longer matches |

- Migration maps existing operator links to accepted, existing auto `reviewed=1`
  to auto_published, other auto links to suggested. Record migration provenance
  without inventing an acceptance timestamp or actor. Preserve created times,
  reasons, manual relations and current publication. Existing deleted dismissals
  cannot be recovered; disclose that historical limit.
- An accepted row retains its model id, relation, operator reason and acceptance
  metadata. Matcher observations can update separate latest-evidence fields,
  never the accepted decision/relation. No-match does not remove acceptance.
- Dismiss retains the pair internally as a negative decision, hides it from all
  active/public projections and logs the decision. It survives every fetch,
  rematch and settings change. Restore requires an explicit operator action;
  restore-to-suggestion does not automatically claim acceptance.
- Reconcile an item's full machine suggestion set in a short transaction under
  an item-row lock, shared with Accept/Dismiss/manual mutations. Re-read decision
  versions inside the lock. Never hold locks across external network requests.
  Repeated identical observations do not duplicate events. Upserts must not
  overwrite accepted/dismissed rows or resurrect dismissed pairs.
  Item-field and topic-tag replacement also commit atomically under that item
  lock. Rematching must never observe a new content hash with the old tag set.
- Retire only machine-owned suggested/auto_published rows absent from a complete
  successful matching result. Disabled matching or failed/incomplete matching
  must not be interpreted as an authoritative empty set.
  A model-scoped rematch reconciles only those exact model ids; it must not
  retire other models' automatic associations as though it matched all models.
- Keep exact public model ids, including free/paid/subscription SKUs. Do not
  replace them with routing's build-stripping `canonicalModelKey`. Where exact
  identical model aliases match multiple SKU ids, show every actual pair with
  qualified names and allow independent decisions. Never infer a different
  version from a similar name or silently retarget an accepted association.
- Model delisting preserves the accepted record in admin with an unavailable
  marker; public links require the existing public-catalog eligibility rule.
  Relisting the exact id restores its eligible association. Renames preserve id.
  Source/item deletion remains an explicit destructive operation with existing
  cascade semantics; persistence here concerns lifecycle/refetch, not a promise
  to survive deliberate deletion of the content itself.
- Add one shared visible-link predicate/projection, used by item detail, model
  coverage, model filters, counts and briefing; separate operator reads show all
  states. Keep `reviewed` only as a transitional compatibility projection, updated
  atomically from state; remove alternate filters before rollout.
  Apply public-catalog eligibility in every public projection/count, not just
  when rendering model detail links. Accepted unavailable models stay in admin.
- Guard Accept/Dismiss/Restore/manual changes with admin+same-origin checks,
  typed payload validation, pair existence/model validation and expected revision.
  Stale conflicting decisions return 409; replay of the same intent is idempotent.
  Record the existing operator principal, UTC time, reason and before/after state;
  no fabricated multi-user admin identity, secrets or upstream payloads.

### Steps

1. **blocked — coding reserved:** additive schema, migration and state types.
2. **blocked — coding reserved:** transactional reconcile/decision/event store.
3. **blocked — coding reserved:** guarded APIs and explicit Accept/Dismiss/Restore.
4. **blocked — coding reserved:** common public projections and all callers.
5. **blocked — coding reserved:** migration, persistence, race and render proofs.

### Verification

Planned `tests/content-link-decisions.test.mjs`: acceptance across refetch with
changed title/aliases, restart and rematch; dismissal across rediscovery; explicit
restore; accepted manual relation protection; machine-only retirement; disabled
matching is not empty reconciliation; idempotency/revision conflicts; legacy
migration; exact SKU/version identity; delist/relist. Use actual stores.
Require a real two-connection Accept/Dismiss versus reconcile race: operator
decision must win regardless of ordering, with one durable outcome per pair.
Implement the race in `tests/content-link-concurrency.test.mjs`, add it to
`scripts/postgres-concurrency-proof.mjs`'s TEST_FILES and fail on skips. HTTP
probes belong in the shared `scripts/http-suite/content-checks.mjs`, invoked
before that runner's destructive readiness test.
HTTP and rendered checks must prove every public consumer hides suggested,
dismissed and retired rows but retains eligible accepted rows. Test detail
explicitly, since it currently lacks the reviewed filter.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/content-link-decisions.test.mjs — planned.
- gate: test tests/content-link-concurrency.test.mjs — planned; test:postgres too.
- gate: test tests/content-store.test.mjs — existing store regression.
- gate: test tests/content-linking.test.mjs — existing matcher regression.
- gate: test tests/catalog-skus.test.mjs — exact billing identities.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, real PostgreSQL/HTTP/recovery included.

### Verification Receipt

Planning evidence only, recorded in master/session summary. No new state/API,
race proof, migration or accepted link behavior is implemented by this pass.

## Perfection Loop

### Loop 1 — RED

- **RED:** auto-reviewed, delete-only dismissal, append-only matching, capped
  display, and inconsistent public filtering are independently evidenced above.
- **GREEN:** durable explicit decisions outrank machine observations; stable pair
  identity and one public visibility authority preserve the operator's intent.
- **AUDIT:** read matcher/store/API/item writes and traced public consumers.
- **ADVERSARIAL:** accepted content stops matching; dismiss races ingestion;
  legacy machine-reviewed rows look human; model disappears; repeated requests.
- **CHANGE DELTA:** initial design; measured audit passes follow below.

### Missed Questions

1. Is accepting a topic tag the same as accepting a model association? No.
   Topic taxonomy and `(item, model)` links are separate; UI must name each.
2. Does Dismiss delete content? No; remove the association from active use,
   retaining only its internal suppression/audit record.
3. Can a settings change erase accepted links? No. Only explicit operator
   decisions or deliberate deletion of the parent can change that obligation.
4. Is old `reviewed=1` proof of acceptance? No; migration labels it automatic.

### Implementation Evidence (REQUIRED for `closed`)

All five implementation steps are blocked by the operator's planning-only
instruction. No implementation commit or closure claim exists.

### Code Verification Evidence

Current manual-preservation WHERE clause and public callers were inspected;
new state, suppression and acceptance APIs are planned. Future reachability:
ingestion/rematch → same reconcile store; admin → decision store; each public
consumer → same visible projection. A compiling schema is not that evidence.

### Loop 2 — Independent audit and self-correction

- **RED:** disappearance from a preview was confused with deletion; detail and
  coverage have different filters; model-scoped reconciliation could retire peers.
- **GREEN:** explicit persistent inventory/decision states, shared public
  projection, scoped retirement and mandatory PostgreSQL race registration.
- **AUDIT:** actual store experiment prints `after_refetch=1`,
  `after_empty_reconcile=1`, `unreviewed_item_links=1 coverage=0`.
- **ADVERSARIAL:** operator acceptance dominates every machine-only path;
  migration cannot claim human review from `reviewed=1`.
- **CHANGE DELTA:** first correction 727/11225 characters (6.477% Levenshtein).

### Loop 3 — Final convergence

Final audits must confirm explicit acceptance persistence, dismissal suppression,
legacy truth, exact identity and consistent visibility. Two final unchanged
passes and their hashes/deltas are recorded in the planning session receipt.

## Resolution

Design-only; no closed/archive date or implementation commit. FID-017 must not
ship a second interpretation of accepted or dismissed.

## Lessons Learned

Human decisions must be durable data. Recent activity is a limited view, not
the inventory of persistent associations; machine publication is not acceptance.
