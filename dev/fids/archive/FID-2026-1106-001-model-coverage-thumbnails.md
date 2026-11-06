# FID: Visual model coverage rows

**Filename:** `FID-2026-1106-001-model-coverage-thumbnails.md`
**ID:** FID-2026-1106-001
**Severity:** low
**Status:** closed
**Created:** 2026-11-06
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Model-page coverage displays linked content as text, even when the same video
has a thumbnail and player in Signal. Present each linked item as a visual,
responsive row with its thumbnail and existing attribution and matching context.

## Environment

- **OS:** Windows
- **Language/Runtime:** TypeScript / Node
- **Tool Versions:** See `package.json` and lockfile.
- **Commit/State:** base `043fed1`; implementation commit `95ed201`. The record
  is closed and archived with that commit's verification receipt.

## Detailed Description

### Problem

`components/content/coverage-panel.tsx` renders relation, source, date, title
and matching reason, but no media. The model page requests six items in
`app/models/[...id]/page.tsx`. Readers must leave the model page to see media.

### Expected Behavior

Display a table-like collection of rows with a thumbnail for each type of
coverage. Valid YouTube videos open the existing player on thumbnail activation;
other thumbnails and all titles lead to the Signal detail page. Preserve the
existing metadata, matching reason, follow control, empty state, order, limit,
and total message. Layout must work on narrow screens and in both themes.

### Root Cause

Coverage consumes `CoverageItem` but renders only its text fields. The existing
`ContentMedia` used by Signal cards already accepts the image and video fields;
`listContentForModel` selects and maps them.

### Evidence

- `components/content/coverage-panel.tsx:66`: `coverage.items.map` renders
  relation, source, date, title and reason only.
- `components/content/content-card.tsx:24`: the existing call already passes
  `thumbnailUrl={item.thumbnailUrl ?? item.github?.ogImageUrl ?? null}`.
- `components/content/content-media.tsx:37,72`: embed validation runs once and
  the media block is fixed at `h-36 w-full`; there is no row presentation.
- `components/content/content-media.tsx:117,156`: a missing or invalid embed
  renders a `/signal/{id}` link; an iframe exists only in the opened dialog.
- `lib/content/store/links.ts:127,157`: the query selects `thumbnail_url`,
  `video_id` and `github_json`, applies `LIMIT`, then counts those rows; the
  separate total query counts every public link.

## Impact Assessment

### Affected Components

- Model coverage panel and shared content media presentation.
- Local browser and HTTP coverage for the model page.

### Risk Level

- [x] Low: presentation and navigation behavior; existing content remains usable.

## Proposed Solution

### Approach

Reuse the existing media component and its validated embed handling. Add an
optional row variant rather than another player; the default card path stays
unchanged. Use semantic list rows, not a table: there are no column headers or
cross-row cell relationships. Keep the title link separate from the media
trigger. Show the stored thumbnail, then the GitHub OG image, then the shared
Signal fallback. Suppress the card's source-label overlay in a row because the
row already carries the source; this avoids covering a 96px thumbnail. Mark the
play affordance only when `videoEmbedUrl` accepted the id, so an invalid id is a
detail link rather than a dead-looking play control. Preserve relation counts
as counts over displayed rows; never describe them as totals.

### Steps

1. Review the relevant source files and Next.js local documentation before edits.
2. Render visual rows for all five content kinds using shared media; preserve
   existing metadata and links. Handle missing image and invalid video IDs.
3. Exercise a mixed fixture on the real model page and prove keyboard, pointer,
   modal dismissal and focus return, mobile/desktop and both themes. Verify no
   iframe loads before video activation and no interactive controls are nested.
4. Run gates, inspect the call graph, re-read the change against this contract,
   record actual results and close only with committed implementation evidence.

### Verification

`videoEmbedUrl` and its invalid-id coverage stay unchanged in
`tests/content-format.test.mjs`. Add a focused
`tests/content-policy.test.mjs` for the default-on and explicit-false content
flag, and one model-page journey to `scripts/browser-matrix.mjs`; the fixture
seeds seven mixed links on
`mock-paid` and none on `free/mock-free`, so the same journey proves the six-row
limit and the honest empty state. At 390×844 and 1280×900, in light and dark,
assert:

- six semantic rows, newest-first, all five kinds, and the exact total message;
- stored thumbnail beats GitHub OG image, which beats the shared fallback;
- a valid video opens the existing dialog by pointer and by keyboard, Escape
  closes it, focus returns, and no iframe exists before activation;
- an invalid id renders no play button and its media link plus every title link
  point to `/signal/{id}`;
- no nested interactive controls and no horizontal overflow;
- the empty free-model route has no rows or total message;
- the existing Signal video-dialog journey still passes.

The runner command is `npm run test:browser`, with a production build present.
The browser receipt records the build id and each journey, and the final gate
receipt records the exact pass/fail lines.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-format.test.mjs
- gate: test tests/content-policy.test.mjs
- gate: test:browser
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-11-06T15:25:12Z
- check: exit 0 (lint zero warnings; typecheck clean)
- focused: `node --test tests/content-format.test.mjs
  tests/content-policy.test.mjs` exit 0, 7/7 tests
- test:browser: exit 0, 14/14 journeys, build `tkJp85sx5BXKQNoi4rlas`
- quality: PASS, 400-line ceiling, 687 files scanned
- build: exit 0
- verify: PASS, 12/12 gates, 1,124/1,124 tests with zero skips,
  PostgreSQL 20/20, 758 main HTTP checks plus trial, recovery 15/15,
  176.6 s
- scope note: the standalone 14/14 full browser run is the interaction
  receipt above; `verify`'s showcase-only browser gate also exited 0.

## Perfection Loop

### Loop 1 — RED

- **RED:** Coverage is text-only while `ContentMedia` already supports a
  thumbnail, a validated embed and a detail link. The model page requests six
  rows (`app/models/[...id]/page.tsx:122`), so the defect is presentation and
  missing interaction coverage.
- **GREEN:** Reuse `ContentMedia` with an optional row presentation; keep the
  title as its own link; use the stored thumbnail, then GitHub image, then the
  shared fallback; preserve every text field.
- **AUDIT:** `ContentMedia` validates the id once
  (`content-media.tsx:37`), renders a detail link when invalid
  (`content-media.tsx:117`) and creates an iframe only inside the open dialog
  (`content-media.tsx:156`). `listContentForModel` selects the image, video and
  GitHub fields and applies `LIMIT` (`links.ts:127,157`).
- **ADVERSARIAL:** A fixed card height, source overlay and play glyph would
  break a 96px row or imply playback for an invalid id. The row variant changes
  the block to `aspect-video`, suppresses the overlay, and ties the play glyph
  to the validated `embed`.
- **CHANGE DELTA:** 6,575 → 7,473 bytes (+13.66%). This is the template
  conformance repair, not a bounded design pass; it exceeds the 10% circuit
  breaker and is disclosed rather than hidden. Later passes are measured below.

### Missed Questions

1. Do relation counts represent all items? No; they count the limited rows.
2. Should every item embed an iframe? No; load a validated video only on action.
3. What if the thumbnail or video ID is absent? Reuse the existing fallback and
   link behavior; verify both in the browser.
4. Must this be a literal HTML table? The requested visual is row-based; use a
   semantic list unless meaningful table headers are provided.
5. Does adding a row variant risk Signal cards? Only if the default class or
   trigger path changes; retain `variant="card"` as the default and cover the
   existing Signal modal journey.
6. How is "all coverage kinds" proved? Seed article, video, paper, repository
   and discussion links in one mixed fixture; assert all six displayed rows and
   titles without relying on kind-specific styling.

### Implementation Evidence

- [x] **Commit SHA:** `95ed201`; base `043fed1`. The implementation is
  committed and the record is archived.
- [x] **File:line ranges:** `components/content/content-media.tsx:20-34` adds
  the optional `row` variant; `:71-99` uses `aspect-video`, suppresses the
  source overlay in a row and ties the play glyph to the validated `embed`.
  `components/content/coverage-panel.tsx:67-107` renders six semantic rows with
  the stored/GitHub/fallback image chain and separate title links.
  `scripts/browser-matrix.mjs:56-140,345-401,646-815` adds the mixed fixture,
  empty route and both-width/theme journey; `tests/content-policy.test.mjs:1-9`
  covers the content flag.
- [x] **Gate output:** check, focused 7/7, browser 14/14, quality, build and full
  verify 12/12 passed; exact receipt is above.
- [x] **Reproducibility:** grep `variant="row"` finds the coverage consumer;
  grep `coverageJourney` finds the journey and its invocation.
- [x] **Step statuses:** steps 1–4 are `implemented`; gates, call-graph audit,
  commit and archive are complete.

### Code Verification Evidence

- [x] Files named in Affected Components exist.
- [x] Implementation matches the Proposed Solution and row/fallback chain.
- [x] Typecheck, lint, focused tests, browser and full verify pass with output
  recorded above.
- [x] Call graph: model page → `listContentForModel` → `CoveragePanel` →
  `ContentMedia` → validated dialog or `/signal/{id}`.
- [x] Status `closed` reflects the committed implementation and archived
  evidence.

### Loop 2 — Independent audit and self-correction

- **RED:** The headline could overstate relation counts, and a row could nest a
  title link inside a media link. A malformed id could still look playable if
  the overlay checked `videoId` instead of `embed`.
- **GREEN:** Keep counts over displayed rows, keep media and title as siblings,
  and gate the play glyph on the validated embed. Require empty and mixed
  coverage, fallback images, invalid ids, no preloaded iframe, no nested
  interactive controls and narrow-width overflow checks.
- **AUDIT:** Counts increment only from the `rows` returned by the limited query;
  the separate total query does not feed `counts` (`links.ts:157-180`). The
  existing title link is already a sibling of media in the card, so the row can
  preserve that structure.
- **ADVERSARIAL:** The default `variant="card"` path must remain byte-for-byte
  compatible in behavior. The browser journey therefore keeps the existing
  Signal video modal assertion and runs the model-page checks in both themes.
- **CHANGE DELTA:** 7,473 → 9,032 bytes (+20.86%) for the audit corrections.
  This also exceeds the 10% cap; the cause is the same incomplete draft, and it
  is recorded in the receipt below rather than represented as compliant.

### Loop 3 — Final convergence

- **RED:** The design still needed a falsifiable fixture sequence and a check
  that counts describe displayed rows. A seven-link fixture with a seventh
  benchmark row makes both observable without a second route.
- **GREEN:** Fixed the verification contract above, confirmed the row keeps the
  media trigger and title link as siblings, and set YAGNI to `Verified`: one
  optional variant and one browser journey, no new player, schema, route or
  dependency.
- **AUDIT:** Independent source re-read: `content-media.tsx:37` returns the same
  validated embed, `:117` is the non-embed link branch, `:156` is the only
  iframe; `links.ts:164-180` counts the limited rows and separately reads the
  total; `page.tsx:122` asks for six. `node --test
  tests/content-format.test.mjs` passed 6/6, including `bad/id` and `short`.
- **ADVERSARIAL:** The fixture's seventh item must sort oldest or the limit
  assertion is meaningless; the seed must use ISO timestamps and a public link
  state. The journey asserts the older title is absent and no `Benchmark` count
  chip appears, so a count over all links fails the check.
- **CHANGE DELTA:** 9,032 → 11,169 bytes (+23.66%) for the verification contract,
  final audit and status. This third pass also exceeds the cap. The draft was
  not template-conformant, so convergence required reconstruction; no bounded
  pass claim is made.

### Convergence receipt

| Step | Start bytes | End bytes | Whole-document delta |
| --- | ---: | ---: | ---: |
| Loop 1 evidence and decisions | 6,575 | 7,473 | +13.66% |
| Loop 2 adversarial corrections | 7,473 | 9,032 | +20.86% |
| Loop 3 final convergence | 9,032 | 11,169 | +23.66% |

All three convergence passes exceed the 10% circuit breaker because the initial
record was an analyzed draft without the required evidence, decisions or test
contract. The deviation is disclosed; the design is stable after the final
re-read and focused tests. This receipt itself changes the byte count below the
recorded 11,169 and is excluded from the design delta calculation.

## Resolution

- **Closed Date:** 2026-11-06.
- **Fix Description:** Model coverage now renders compact media rows using the
  shared validated player, with stored/GitHub/fallback image precedence, a
  separate title link for every row, unchanged metadata and display-scoped
  relation counts.
- **Tests Added:** Yes — `tests/content-policy.test.mjs` and the model-coverage
  browser journey in `scripts/browser-matrix.mjs`.
- **Verification Evidence:** check, focused 7/7, browser 14/14, quality, build
  and full `verify` 12/12 (1,124 tests) pass; receipt above.
- **Archived:** Yes — `dev/fids/archive/FID-2026-1106-001-model-coverage-thumbnails.md`.

## Lessons Learned

An existing data projection can carry media that one presentation does not use;
trace both the data path and shared interactions before adding another player.
