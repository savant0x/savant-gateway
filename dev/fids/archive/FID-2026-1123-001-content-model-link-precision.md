# FID: Content-to-model linking precision and readability

**Filename:** `FID-2026-1123-001-content-model-link-precision.md`
**ID:** FID-2026-1123-001
**Severity:** high
**Status:** converged
**Created:** 2026-11-23 19:40
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The content matcher has one correct half and one weak half. The decision half —
five states, an append-only `link_decisions` audit, automatic work that can never
overwrite an operator answer — is sound and stays. The matching half is a literal
token-sequence test over aliases derived from three catalog strings, and it fails
measurably in three ways: an older model is linked whenever a newer one is
discussed (83 of 234 alias keys are a strict token-prefix of another), one
headline produces up to ten near-identical price cards because the catalog sells
the same weights under several provider prefixes, and a large recall gap leaves
7 of 14 realistic headlines linking nothing at all. Nothing in the repository
measures any of this, so the operator's "seems very low quality" is currently
the only signal.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `db09d70` on `main` (clean)

## Detailed Description

### Problem

`lib/content/linking.ts` builds aliases from `lastSegment(model.id)`,
`model.name` and `lastSegment(model.upstreamId)`, drops any alias with fewer than
two tokens (`MIN_ALIAS_TOKENS = 2`), drops any non-operator alias without a digit,
and matches when those tokens appear as a contiguous in-order sequence in the
title, an exact tag, or — for YouTube only — the description.

Five consequences, each measured against the 507-id vendor catalog captured in
`.scratch/inh-models.json` and 21 headlines written to look like real ones:

1. **Wrong generation.** `suggestModelLinks` tracks a best match *per model*, so a
   prefix alias still fires when the same title contains a longer alias.
   `"GLM-5.3 is now available through the API"` returns 10 links including `glm-5`
   and `kiro/glm-5`; `"Kimi K2.5 Thinking is out"` links only the base model.
   83 of 234 unique alias keys are a strict token-prefix of another.
2. **Duplicate cards.** A link points at a provider-scoped `models.id`, so one
   model sold by many providers is many links. The same DeepSeek id returns 7
   rows, GLM 8–10, MiniMax 8. `components/content/model-module.tsx` renders a full
   price card per row, so `/signal/<id>` shows ten panels for one model.
3. **No alias at all.** 43 of 507 catalog rows produce zero aliases: any id
   without a digit is refused (`ds/deepseek-flash`, `cbcn/space-bunny`) and any
   single-token id is refused (`cb/hy3`). A strict classifier therefore cannot
   ever link them, no matter how the source writes the name.
4. **Recall holes.** Matching requires the alias's first token, so
   `"Sonnet 4.5 is Anthropic's best coding model"`, `"Claude 4.6 Opus ships"`
   (word order) and `"Gemini 3 Pro review"` (version drift) link nothing. Only
   YouTube descriptions are searched, so an article or repository that names the
   model in its excerpt or body never links.
5. **Unmeasured.** There is no evaluation corpus and no test asserts precision on
   realistic headlines. The current suite pins the *literal* rule, so any future
   change can regress quality with every gate still green.

A sixth defect is durability rather than matching: `app/signal/[id]/page.tsx:110`
resolves each link through the live catalog and drops the ones it cannot find, so
disabling a provider or letting it rotate an id silently removes a linked model
from the article while `content.model_links` still holds the evidence.

### Evidence

Measured with `.scratch/link-quality-probe.mjs`, `.scratch/link-alias-stats.mjs`
and `.scratch/link-recall-probe.mjs` (gitignored scratch, read-only, no network):

```text
catalog 507 | no alias 43 | shared alias keys 104 | strict-prefix pairs 83
exact-title hits 7/14 | headline misses 7/14 | prefix-noise rows 8 (over 14)
"GLM-5.3 …"        → 10 links, incl. glm-5            (wrong generation)
"DeepSeek V4.1 …"  → 7 links, all the same weights    (duplicate cards)
"Sonnet 4.5 …"     → 0 links                          (recall)
"Claude 4.6 Opus"  → 0 links                          (word order)
```

The local database holds 0 content items and 0 links, so this measurement is the
matcher against the real catalog, not against a real corpus. That gap is part of
the finding: quality cannot be observed in production either, because no report
exists.

## Goals

1. A committed, labelled evaluation corpus and a test that reports precision and
   recall numbers, so a matcher change is measured rather than asserted.
2. Longest-match suppression: when a title contains a longer alias of the same
   family, the shorter prefix alias of that family does not link.
3. Alias generation that admits non-versioned and single-token ids under a
   precision guard, and derives aliases from `family` plus version and a
   word-order-tolerant window.
4. Bounded excerpt/body matching for every kind, keeping the operator's rule that
   a match is a literal phrase and never a fuzzy score.
5. One card per underlying model: links grouped by `canonicalModelKey` at read
   time, with the provider rows listed inside the card.
6. An unpublished model keeps its article link: a link whose catalog row is gone
   renders as unavailable rather than disappearing.

## Non-Goals

- Publishing a link that no rule proves. This FID changes when the literal rule
  fires, never whether a guess is shown publicly.
- Semantic or embedding matching, and any near-miss suggestion tier. That is
  registered as a separate work item (see "Registered work items") because it
  needs its own evaluation and a review queue.
- Changing the decision table, the state machine, `link_decisions`, or the
  accepted/dismissed guarantees. Those are correct as shipped.
- Rewriting the rematch scheduler.

## Registered work items (owned, active, not dropped)

| ID | Item | Next action |
| --- | --- | --- |
| CL1 | Near-miss suggestion tier (family+version candidates, unpublished until confirmed) | Needs the CL2 corpus first; opens its own FID after this one lands |
| CL2 | Evaluation corpus growth beyond the first 21 headlines | Extend the fixture with real ingested headlines once a content source runs |
| CL3 | Rematch throughput (10 items per cron call processes a large backlog slowly) | Measure with the corpus in place, then size the batch |
| CL4 | Disabled-provider link durability beyond this FID's unavailable row (retention, back-fill after re-enable) | Review once `link_decisions` and the render agree on unavailable rows |

## Affected Components

- `lib/content/linking.ts` — alias generation, matching, suppression
- `lib/content/types.ts` — link model shape if grouping needs a field
- `lib/content/store/links.ts` — read-time grouping for one item and for coverage
- `lib/content/store/items.ts` — candidate models (family passthrough)
- `components/content/model-module.tsx` — grouped card rendering
- `app/signal/[id]/page.tsx` — unresolved-link handling
- `tests/fixtures/content-link-eval.json` (new) and
  `tests/content-link-eval.test.mjs` (new)
- `docs/content-matching.md` (new) and `CHANGELOG.md`, `SCOPE.md`

## Proposed Solution

1. **Corpus first.** Commit `tests/fixtures/content-link-eval.json`: 21 headlines,
   each with the model keys that must link and the keys that must not. The test
   asserts exact expected sets and prints `precision/recall` in its name. Run it
   against today's matcher to record the RED numbers (7/14, 8 noise rows).
2. **Suppression.** While scanning a title, take the longest alias match per
   family at a position; a shorter alias whose tokens are a strict prefix of a
   matched longer alias in the same family is discarded. Versioned aliases still
   win over unversioned at equal confidence.
3. **Alias generation.** Accept a non-versioned id when its alias has two or more
   tokens and at least one is alphabetic (`deepseek flash`); accept a single-token
   id only when it is not a bare English word from a small stop list, so `o3`
   links and `next` does not. Add a family-derived alias (`family` + trailing
   version tokens) and a window match that allows up to two filler tokens between
   alias tokens (`claude 4 6 opus` for `claude opus 4 6`).
4. **Body text.** Generalize `descriptionMatches` to every kind over the excerpt
   plus a bounded body window (first 4,000 characters), recording the matched
   phrase in `reason` so the operator can see why.
5. **Grouping.** `listLinksForItem` groups visible rows by `canonicalModelKey` and
   returns the primary row plus the other provider ids; the module renders one
   card with a provider count and the cheapest published price. `listContentForModel`
   keeps its exact-id query so a model page stays exact.
6. **Unavailable rows.** The module receives every visible link, not only those it
   could resolve, and renders the unresolved ones as "not currently sold here"
   with the link's relation and date, instead of dropping them.

## Risks & Mitigations

- **Fewer links is a regression in disguise.** Grouping and suppression both
  reduce row counts. Mitigation: the corpus asserts expected model *keys*, and
  the item page asserts one card per key with all provider rows present.
- **Grouping hides a price difference.** The card shows the cheapest published
  price and names the provider count; the model page keeps every row.
- **Window matching inflates recall with filler sentences.** The window allows at
  most two filler tokens and is asserted by negative cases in the corpus.
- **Single-token aliases are the highest-precision risk.** They are admitted only
  behind the stop list and covered by negative corpus rows.
- **A migration touches nothing.** No schema change is planned; if grouping needs
  a stored key, it is derived at read time from existing columns.

## Verification Plan

1. `node --test tests/content-link-eval.test.mjs` — RED first (recorded numbers),
   then GREEN with the same fixture, no fixture edits to make it pass.
2. `node --test tests/content-linking.test.mjs tests/content-description-matching.test.mjs`
   — the literal guarantees that must not weaken (no family match, no `GPT-4o` for
   `GPT-4`, no substring match).
3. `node --test tests/content-link-decisions.test.mjs tests/content-match-management.test.mjs`
   — the audit and state guarantees are untouched.
4. A postgres or pglite case: two provider rows for one weights set render as one
   card, and disabling one provider leaves the card (grouping recomputed).
5. `npm run verify` — 12/12 gates, zero skipped, pasted into the FID.

## Acceptance Criteria

1. The corpus test reports every labelled row correct, and the precision/recall
   counts before and after are both written into this FID.
2. `"GLM-5.3 is now available"` links `glm 5 3` and not `glm 5`.
3. One headline about one model yields one card carrying the other provider ids.
4. A link whose catalog row disappeared still renders, marked unavailable.
5. No existing literal-precision test weakens; no schema change.

## Loop 1 — RED / GREEN / AUDIT / ADVERSARIAL

- **RED:** the measurements above (7/14 exact hits, 8 noise rows, 43 alias-less
  rows, 83 prefix pairs) are the failing state, produced by running the shipped
  matcher against the shipped catalog.
- **GREEN:** six bounded steps, no dependency, no schema change; each step is
  covered by a corpus row or an existing literal test.
- **AUDIT:** `grep -rn "suggestModelLinks" lib app` stays one writer plus one
  caller; `grep -rn "replaceAutoLinks" lib` stays the only automatic write path;
  `grep -rn "listLinksForItem" app components` shows the render surfaces changed.
- **ADVERSARIAL:** "Does suppression drop a legitimate link?" Only when a longer
  alias of the same family matched at the same place, which is exactly the case
  where the shorter one is the wrong generation. "Does grouping lose a price?"
  No: the card names the provider count and the model page keeps every row.
  "Does window matching turn prose into links?" Filler is capped at two tokens and
  a negative corpus row pins it.
- **CHANGE DELTA:** 0% — first convergence pass.
