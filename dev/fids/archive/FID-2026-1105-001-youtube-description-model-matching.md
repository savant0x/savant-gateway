# FID: Match model mentions in YouTube descriptions

**Filename:** `FID-2026-1105-001-youtube-description-model-matching.md`
**ID:** FID-2026-1105-001
**Severity:** medium
**Status:** closed
**Created:** 2026-11-05
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Expand the existing literal content/model matcher to use the stored description
of YouTube videos in addition to title and tags, during both ingestion and
stored-item rematching. Preserve explicit accepted and dismissed decisions. This
record specifies and tracks the implementation authorized on 2026-11-05.

## Environment

Windows, PowerShell, Node 24, Next.js 16 and PostgreSQL/PGlite. Grounding HEAD
`1c4c2a5`; SCOPE YD1–YD2 and YI1–YI3. The operator subsequently authorized
implementation and FID completion.

## Detailed Description

### Problem

A video can discuss a catalog model in its description without naming it in
the title or publishing it as a tag. The current matcher misses that model.

### Expected Behavior

An exact model alias in the available YouTube description yields an association
with a description-specific reason, subject to the existing matching policy,
publication and operator decision rules. The same input and result apply when
a source is fetched again and when existing stored videos are rematched.

### Root Cause

The shared matcher accepts only title, tags and kind. Both ingestion and the
rematch query omit the already-stored description from its input.

### Evidence

- `lib/content/feed-youtube.ts:45` reads the feed description; lines 51–54
  truncate the excerpt, while lines 68–69 store excerpt and `bodyHtml`.
- `lib/content/linking.ts:150` defines `LinkInput` with title, tags and kind;
  `suggestModelLinks` at line 165 checks only title tokens and exact tag keys.
- `lib/content/ingest-source.ts:269` passes those fields after upserting an item.
- `lib/content/store/rematch.ts:292` passes stored title, tags and kind, not body.
- `lib/content/store/link-writes.ts:78` reconciles automatic links while
  protecting accepted and dismissed rows. Reuse this authority.
- Existing focused baseline, 2026-11-05:

```text
node --test tests/content-linking.test.mjs tests/content-ingest.test.mjs tests/content-rematch.test.mjs
tests 17; pass 17; fail 0; skipped 0; exit 0
```

## Impact Assessment

### Affected Components

Shared matcher and input types; YouTube description extraction; source ingestion;
stored-item rematch query and row type; matching policy and admin settings;
matching documentation and existing content tests. Existing source rows and
operator decisions must remain intact. No billing or model routing changes.

### Risk Level

- [x] Medium: missing matches reduce discovery; descriptions may also contain
  unrelated model lists, URLs, markup, sponsorship text and misleading claims.
- Descriptions are untrusted and can be lengthy. Matching must be bounded and
  must not interpret markup attributes or URLs as prose.

## Proposed Solution

### Approach

1. Limit this feature to `source.kind === 'youtube'`, not all `video` items:
   source kind is authoritative in both ingestion and rematch. Obtain stored
   description from the existing YouTube `body_html`, falling back to the stored
   excerpt only when body is absent. Excerpt is limited to 480 characters and
   is not a substitute for a missing full description; report that limitation
   honestly. Do not fetch YouTube again merely to rematch.
2. Introduce one shared deterministic extraction helper used in both paths.
   Convert sanitized body markup to visible plain text, decode entities and
   preserve word boundaries at tags; remove URLs before tokenization so links,
   tracking parameters and HTML attributes cannot create model mentions. Bound
   input and output to the existing `CONTENT_LIMITS.maxBodyChars` (120,000).
   Empty/malformed input produces no description evidence. Avoid new network or
   paid services. Never log description text or interpolate it into SQL.
3. Extend `LinkInput` with optional description evidence and source kind. Reuse
   existing normalized token-sequence and model-alias logic; retain exact model
   IDs and distinct billing SKUs. Guard against shorter model aliases matching
   inside a longer sibling name using occurrence-local longest alias matching;
   a separate explicit base-model occurrence remains valid. Do not match bare
   families, substrings or other source descriptions.
4. Evidence precedence is title, exact tag, then description. Preserve the
   existing title/tag confidence values; give description evidence 0.7 and a
   bounded reason `Description matches “<alias>”`. These are rule weights,
   not calibrated probabilities. A model gets one strongest reason. Description
   suggestions start as `suggested`, even when automatic publication is enabled:
   incidental lists in descriptions are not proof of central subject matter.
   Explicit Accept publishes and persists using the existing decision path.
5. Add `matchYouTubeDescriptions` to the existing matching policy and dashboard,
   default `true` for missing older policy rows. Validate boolean input and use
   the existing revision/409 behavior. Disabling it stops new description
   evidence; it does not clear accepted or dismissed links. A complete rematch
   may retire machine-owned links whose only evidence has disappeared; explain
   this effect in the UI. Preserve old title/tag behavior and existing policy.
6. At ingestion, derive evidence from the freshly upserted stored row, not a
   transient body that differs from `COALESCE`-preserved stored content. At
   rematch, join `content.sources` and load source kind, body and excerpt in
   the bounded item batch. Both paths invoke the same helper and matcher.
   Respect per-item transaction/claim boundaries and prevent stale item or policy
   inputs from overwriting newer decisions. If consistent snapshot/fencing is not
   available, implement it in the existing FID-017 rematch authority before
   claiming race safety; do not create a parallel job system.
7. Existing videos become eligible on an operator-triggered existing rematch;
   no implicit full archive scan on page render or deployment. Explain how to
   run and monitor it in the admin matching UI. Existing accepted/dismissed
   model pairs never change due to description matching or policy toggles.

### Steps

1. **implemented:** shared bounded description normalization and
   precise matching evidence, with YouTube source-kind gating.
2. **implemented:** wire stored evidence into ingestion and rematch.
3. **implemented:** add backward-compatible policy/dashboard control.
4. **complete:** verify behavior, decision persistence, races and operator rematch.

### Verification

Extend `tests/content-linking.test.mjs` for description-only matches, precedence,
alias punctuation, family/sibling refusal, URL/markup exclusion, bounds and
non-YouTube input. Extend `tests/content-ingest.test.mjs` with a fixture video
whose only model mention occurs after character 480. Extend
`tests/content-rematch.test.mjs` to prove existing stored video matching without
network, body/excerpt fallback, toggle behavior and accepted/dismissed survival.
Extend `tests/content-match-management.test.mjs` for policy migration and
validation. Exercise the actual guarded admin setting and rematch endpoints via
the HTTP suite; verify a description suggestion remains review-required even
with auto-publish enabled. A real two-connection test must cover a decision
racing a rematch and stale item/policy changes; register that proof in the
existing mandatory PostgreSQL runner. Render the settings/reason and verify
keyboard use. Preserve actual output and production call-graph evidence.
The description-focused behavior is additionally covered by
`tests/content-description-matching.test.mjs`.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/content-linking.test.mjs.
- gate: test tests/content-description-matching.test.mjs.
- gate: test tests/content-ingest.test.mjs.
- gate: test tests/content-rematch.test.mjs.
- gate: test tests/content-match-management.test.mjs.
- gate: test tests/content-link-concurrency.test.mjs — extend and register race proof.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, including PostgreSQL, HTTP and recovery.

### Verification Receipt

Implementation commit: `84189f8`. On disposable PostgreSQL 17.6,
`npm run verify` exited 0: all 11 gates PASS, 1,037/1,037 tests passed with
zero skipped; PostgreSQL concurrency, quality (633 files), production build,
HTTP suites and recovery passed. The two link concurrency tests passed five
additional consecutive runs. A headless Edge session on disposable data verified
keyboard operation, saved policy persistence after reload and the description
reason in the link inventory. An earlier concurrent run exposed a deadlock;
decisions and manual links now lock the parent item before the link, matching
the rematch lock order, and the tests above passed after that correction.

## Perfection Loop

### Loop 1 — RED

- **RED:** description is stored but both matcher callers omit it.
- **GREEN:** shared bounded visible-text extraction, source-kind gate, explicit
  description evidence, policy toggle, both production callers and rematch.
- **AUDIT:** source and call paths cited above; baseline tests pass 17/17.
- **ADVERSARIAL:** long descriptions, incidental links, wrong source kind,
  sibling model names, missing body and automatic publication are addressed.
- **CHANGE DELTA:** initial design baseline.

### Missed Questions

1. Does this include full article bodies? No; this request concerns YouTube
   descriptions. Other source types remain on the current title/tag behavior.
2. What about existing videos? Run the existing bounded rematch; it reads stored
   bodies and does not contact the publisher.
3. Is an incidental description mention proof of endorsement? No; it is a
   review-required suggestion, even when other matches can auto-publish.
4. What if the saved description is missing? Match only available excerpt text;
   a later normal fetch may provide more content. Do not invent missing text.
5. Can a rematch erase a human decision? No; accepted and dismissed decisions
   are authoritative and must survive all automatic reconciliation.

### Implementation Evidence

Implementation was subsequently authorized. Ingestion and bounded rematching
call `matchStoredItem`, which reads the locked stored item and current locked
policy, extracts YouTube description evidence and calls `suggestModelLinks` and
`replaceAutoLinks`. Hosted operation is not claimed.

### Code Verification Evidence

`ingest-source.ts` and `store/rematch.ts` both call `matchStoredItem`; that
function reads the stored item and policy, calls `descriptionEvidence` and
`suggestModelLinks`, then reconciles via `replaceAutoLinks`. The ingestion and
stored-rematch fixture verifies a mention beyond the excerpt, without a network
request during rematch; the HTTP and browser receipts exercise the operator UI.

### Loop 2 — Independent audit and self-correction

Audit focus: persisted-body versus fresh-feed disagreement; truncated excerpts;
URLs versus prose; source-kind versus generic video kind; stale concurrent
rematch; incidental mentions; accepted/dismissed preservation. Corrections are
incorporated in the approach and verification contract.

Evidence: `lib/content/store/item-writes.ts:132` preserves a previous body
when the new body is null; `lib/content/store/rematch.ts:292` supplies no body;
`lib/content/policy.ts:43` sets body/excerpt bounds to 120,000/480. All five
declared focused test paths exist. The independent audit selected stored-row
evidence, an excerpt fallback, explicit source identity and review-required
description matches before the initial FID was written.

### Loop 3 — Final convergence

Final review checked source paths, declared test gates, planning-only boundary
and persistence rule. Two unchanged reads of the pre-receipt document produced
identical SHA-256 `0b24f2c9c171ab2aadc4c39ba639ab7c70cfae56695ec1c461b0fb08b892da6a`;
each measured 0% character change. This receipt edit follows those reads, so
the recorded hash refers to the pre-receipt document, not the final bytes.
`npm run repository:check` and `npm run attribution` both exited 0. No
implementation verification is implied by document convergence.

## Resolution

Implemented and verified locally in `84189f8`. Existing items become eligible
when the operator runs rematch; the implementation does not initiate an archive
scan on page load. Hosted operation was not tested.

## Lessons Learned

Stored text is useful for discovery only when every matching entry point receives
the same evidence and human decisions remain authoritative.
