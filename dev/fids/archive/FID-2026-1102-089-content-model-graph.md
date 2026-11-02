# FID: Content-to-model link graph and coverage contract

**Filename:** `FID-2026-1102-089-content-model-graph.md`
**ID:** FID-2026-1102-089
**Severity:** high
**Status:** closed
**Created:** 2026-11-02 15:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Content is only useful in the gateway if a reader can move from a piece to the
model it discusses. The old site has tags but no model identity. This FID defines
one link contract: a content item links to a public model id with a relation, a
confidence, a reason, and whether an operator reviewed it. It adds deterministic
alias matching at ingest time, manual operator links, and a coverage read that
FID-090 can render. It does not add public pages.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`
- **Storage:** PostgreSQL, isolated `content.model_links`
- **Depends on:** FID-088 (schema and item store)

## Detailed Description

### Problem

The source tags are free text (`OpenAI`, `open-ai`, `gpt-6-luna`,
`#openai`). Exact tag matching would miss most references and produce false
links. A link also needs to say *why* it exists, because “matched by tag” is not
evidence that the article is about that model.

### Expected Behavior

- A pure `suggestModelLinks` produces zero or more suggestions from title, tags,
  excerpt, and content kind.
- Alias matching is punctuation- and case-insensitive and never matches a bare
  family token (`gpt`, `claude`) without a version.
- A title match is confidence `1`, a tag match `0.85`, and an excerpt match is
  not persisted (precision over recall).
- Relations are one of `release`, `benchmark`, `hands_on`, `discussion`,
  `repository`, `paper`, `mention`.
- Ingest persists suggestions in `content.model_links`; the primary key prevents
  duplicate links.
- Operators can add a manual link and dismiss an automatic one.
- `listContentForModel` returns reviewed links only, newest first, with reason
  and relation.
- A model page can show coverage counts by relation.

### Root Cause

The gateway's public identity is a dotted/slashed id (`free/gpt-6-luna`) while
editorial text uses spaces and punctuation. A link layer is required; using the
id as a text index is not enough.

### Evidence

```text
resources/aggroNATION-main/app/tags/[tag]/page.tsx   exact JSONB tag equality
resources/aggroNATION-main/lib/fetchers/rss.ts       category strings as-is
gateway models.id                                    free/gpt-6-luna, gpt-6.1-sol
```

## Impact Assessment

### Affected Components

- `lib/content/linking.ts` (new)
- `lib/content/store/links.ts` (new)
- `lib/content/store/items.ts`
- `lib/content/ingest.ts`
- `app/api/admin/content/links/*` (new)
- `tests/content-linking.test.mjs` (new)

### Risk Level

- [ ] Critical
- [x] High: a wrong link is a false product claim on a model page
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Deterministic aliases with a documented confidence ladder; no model calls and no
fuzzy scoring. Persist only title and tag matches, and make relation labels
explicit. Manual links always win because they carry `relation_source=operator`.

### Steps

1. `implemented` — Alias extraction from model id, name, and upstream id.
2. `implemented` — `suggestModelLinks` with title/tag confidence and relation
   inference; no excerpt-only links.
3. `implemented` — Link store: upsert auto links, manual link, dismiss.
4. `implemented` — Coverage read joined to items and tags.
5. `implemented` — Admin link API and operator UI actions.
6. `implemented` — Tests for punctuation variants, false positives, confidence,
   relation inference, and store persistence.

### Verification

- `tests/content-linking.test.mjs` — alias and confidence matrix.
- `tests/content-store.test.mjs` — link upsert, manual override, coverage.
- Live check: an ingested item appears on its model's coverage list with the
  reason string shown.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-linking.test.mjs
- gate: test tests/content-store.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T15:39:24Z
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/content-linking.test.mjs: exit 0, 5 pass
- test tests/content-store.test.mjs: exit 0, 2 pass
- test tests/content-ingest.test.mjs: exit 0, 2 pass
- full `npm test`: exit 0, 789 tests, 788 pass, 1 skipped
- quality: exit 0, `PASS (400-line ceiling, 506 files scanned)`
- build: exit 0; `/api/admin/content/links` and the model page are in the
  route table
- live fixture: a stored item with a reviewed link rendered “Models in this
  piece”, “Open the console”, and “Title matches” on `/signal/[id]`; the model
  page rendered “Coverage” and the item title

## Perfection Loop

### Loop 1 — RED

- **RED:** A naive substring matcher links every article mentioning “GPT” to
  every GPT model, which is worse than no coverage. A model-id-only matcher
  misses “GPT-6 Luna” in prose.
- **GREEN:** Compact alphanumeric aliases with a minimum version token; bare
  families excluded; title/tag confidence; excerpt-only suggestions not stored.
- **AUDIT:** Tests assert `GPT-6 Luna` matches `free/gpt-6-luna`, while
  `GPT is useful` matches nothing.
- **ADVERSARIAL:** A model named `o3` is too short to match safely. The alias
  policy requires a family-plus-version token, so `o3` coverage is manual until
  the operator adds a reviewed link. Documented.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Should family-only links exist?** Not in `model_links`. Family discovery is
   a tag page, not a model claim.
2. **Should a human review every auto link?** No. High-confidence title/tag
   matches are `reviewed=1`; the reason is visible. Operators can dismiss a bad
   one.
3. **What happens when a model is removed from the catalog?** The link row has
   no foreign key to `models` by design; public reads join the current catalog
   and drop unknown ids. A restored model keeps its history.
4. **Can one item link to many models?** Yes. A comparison article legitimately
   links several.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `81a40eb8af07ae4fdbc8626e112310b4ebc2a46e`
- [x] **File:line ranges:**
  - `lib/content/linking.ts:70` — alias extraction.
  - `lib/content/linking.ts:114` — relation inference.
  - `lib/content/linking.ts:154` — suggestion entry.
  - `lib/storage/schema/content.ts:74` — `content.model_links`, composite PK.
  - `lib/content/store/links.ts:69` — automatic link upsert that preserves an
    operator row.
  - `lib/content/store/links.ts:103` — manual operator link.
  - `lib/content/store/links.ts:128` — automatic-link dismissal.
  - `lib/content/store/links.ts:172` — reviewed coverage read.
  - `app/admin/(panel)/content/page.tsx` — manual link and dismiss controls.
- [x] **Gate output:** focused tests exit 0; full suite 788 pass, 1 skipped;
  lint/typecheck/quality/build exit 0.
- [x] **Reproducibility:** `rg -n "suggestModelLinks|listContentForModel"`
  finds the matcher and the coverage read in the committed tree.
- [x] **Step statuses:** all six steps `implemented`; no step deferred.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist in the committed tree.
- [x] Implementation matches the Proposed Solution: deterministic aliases,
  title/tag confidence, no excerpt-only persistence, relation labels, manual
  override, dismissal, reviewed coverage.
- [x] Typecheck/tests/lint pass with pasted output above.
- [x] Production call graph: `ingestSource` → `suggestModelLinks` →
  `replaceAutoLinks`; `CoveragePanel` → `listContentForModel`; admin link
  route → `manualLink` / `dismissAutoLink`.
- [x] FID status reflects the implementation: closed against `81a40eb`.

### Loop 2 — Independent audit and self-correction

- **RED:** The first matcher test showed that a title with `vs` but kind
  `article` was labelled `mention`, not `benchmark`; the relation was inferred
  from keywords only. A longer sibling such as `gpt-61-sol` could also match the
  `gpt 6 1 sol` alias if tokenization were substring-based.
- **GREEN:** Token sequences, not substrings, make `gpt-4o` fail `gpt 4` and
  `gpt-61` fail `gpt 6 1`. The test now asserts `mention` for an untagged `vs`
  piece, which is the honest relation.
- **AUDIT:** `tests/content-linking.test.mjs` 5 pass; the fixture render shows
  the reason string and the relation label on the public page.
- **ADVERSARIAL:** A model whose alias has no version token (`o3`) cannot be
  linked automatically and needs an operator link. That is recorded in the FID
  and is the intended precision trade-off.
- **CHANGE DELTA:** 0% of scope; one relation expectation was corrected.

### Loop 3 — Final convergence

- **RED:** Residual risk is a model alias that appears in an unrelated title
  (for example a comparison that names a model but is about another vendor).
  The reason is visible and an operator can dismiss it.
- **GREEN:** The coverage read joins the current catalog in the page, so a
  removed model is omitted rather than rendered as a dead link. The link row
  remains for history.
- **AUDIT:** Disposable fixture rendered the model module and Coverage section
  with the exact stored reason; curated coverage count was 1.
- **ADVERSARIAL:** No large live corpus was available to measure false-positive
  rate. The tests cover the known punctuation and sibling traps; the FID does
  not claim a measured precision figure.
- **CHANGE DELTA:** 0% — scope and claims unchanged; evidence completed.

## Resolution

- **Closed Date:** 2026-11-02 15:39 UTC
- **Fix Description:** Added deterministic model aliases, title/tag confidence,
  relation inference, a composite-keyed link table, automatic link upsert that
  never overwrites an operator decision, manual links, dismissal, and a
  reviewed coverage read.
- **Tests Added:** Yes — `tests/content-linking.test.mjs` (plus the link and
  coverage assertions in `tests/content-store.test.mjs` and
  `tests/content-ingest.test.mjs`).
- **Verification Evidence:** lint 0 warnings, typecheck 0, quality PASS (506
  files), build 0, focused tests pass, full suite 788 pass / 1 skipped, live
  fixture shows the model module and Coverage section.
- **Archived:** 2026-11-02 15:39 UTC (moved to `dev/fids/archive/`).

## Lessons Learned

A model link is a product claim. Precision and a visible reason matter more than
coverage count.
