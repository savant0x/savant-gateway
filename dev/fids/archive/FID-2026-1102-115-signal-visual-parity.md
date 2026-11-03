# FID: Signal visual parity and fallback artwork

**Filename:** `FID-2026-1102-115-signal-visual-parity.md`
**ID:** FID-2026-1102-115
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 18:30
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Signal cards currently render no media at all when an RSS item has no origin
thumbnail. The supplied `assets/thumb.jpg` is the intended Savant fallback, but it
is not yet connected to the Signal media path. Discussion metadata also uses
generic gray tag links and the detail page gives every kind the same cyan pill,
which does not match the aggroNATION reference's source badge, `#tag` pills, and
stable visual color language. This FID unifies the presentation without changing
stored content, source filtering, or billing behavior.

## Environment

- **OS:** Windows host
- **Language/Runtime:** TypeScript strict, Node.js v24.21.0 host; project target Node `22.x`; Next.js 16.4.3
- **Tool Versions:** npm 12.2.1; Tailwind CSS 4; React 19.3.0
- **Commit/State:** implementation `3436a4d`; unrelated Speed Insights,
  generated Next.js agent-rule edits, and `assets/gateway-black-banner.jpg`
  remain uncommitted
- **Supplied Asset:** `assets/thumb.jpg` (83,941 bytes; 1024×683 screenshot-matching artwork)

---

## Detailed Description

### Problem

1. `components/content/content-card.tsx:30-37` only renders
   `ContentMedia` when `thumbnailUrl`, `videoId`, or GitHub data exists. RSS
   articles and discussions without images therefore have no visual block and
   do not use the supplied artwork.
2. `components/content/content-media.tsx:63-79` falls back to a gradient when
   its `thumbnailUrl` is null; there is no shared local fallback image or source
   badge.
3. Card tags at `components/content/content-card.tsx:74-85` and detail tags at
   `app/signal/[id]/page.tsx:150-161` are plain border links. They do not use the
   aggroNATION convention of `#tag` display text or stable colored topic pills.
4. The detail kind pill at `app/signal/[id]/page.tsx:123-125` is always cyan,
   while the card already has an unshared per-kind map. The same content kind
   therefore changes visual language between list and detail surfaces.
5. The aggroNATION reference confirms the intended pattern:
   `resources/aggroNATION-main/components/home/ContentCard.tsx:44-64` chooses a
   real thumbnail or a branded fallback, `:95-105` renders up to three `#tag`
   links, and `components/home/SourceBadge.tsx:12-21` overlays a quiet source
   pill. `config/type-visuals.ts:4-21` documents fallback artwork as render-time
   behavior where a real thumbnail wins.

### Expected Behavior

- Every non-compact Signal card has a consistent media block. A source thumbnail
  or GitHub image wins; otherwise the supplied `assets/thumb.jpg` renders as the
  default background. No content row is blank merely because RSS omitted an
  image.
- The media block carries a quiet source-label badge like the aggroNATION
  reference. The badge is decorative because the source is already exposed in
  card text and accessible semantics elsewhere.
- Kind pills use one shared static color map across cards and detail pages:
  article cyan, video rose, paper violet, repository emerald, discussion amber.
- Topic pills use a deterministic stable palette keyed by the normalized tag, so
  `ai-agents` does not change color between renders or pages. Topic links display
  `#ai-agents` while their URL remains `/signal/topics/ai-agents`.
- Cards show the existing bounded three-topic preview; detail pages show every
  stored topic in a wrapping row. No tags are deleted, reclassified, or merged.
- Empty tag arrays render no empty pill row. Existing source, kind, date, title,
  excerpt, model links, reader behavior, and external URLs remain unchanged.
- The fallback asset is a local static import so it does not require a remote
  image allowlist or a runtime fetch. It remains an operator-supplied source
  asset under `assets/` and is committed with the feature.

### Root Cause

Signal's first implementation treated a thumbnail as optional layout content and
implemented kind/tag styling independently at each call site. The reference
design treats media as a stable card frame and owns fallback/source identity as
shared presentation rules. Without a shared style contract, the list and detail
surfaces drifted and discussions exposed raw normalized tags instead of the
reference's topic-pill language.

### Evidence

```text
Current gateway:
components/content/content-card.tsx:30-37 — media is conditional on an image/video/repo
components/content/content-media.tsx:63-79 — null image becomes only a gradient
components/content/content-card.tsx:13-19 — card-only kind colors
components/content/content-card.tsx:74-85 — plain tag links, no # prefix
app/signal/[id]/page.tsx:123-125 — detail kind is always cyan
app/signal/[id]/page.tsx:150-161 — detail tags use generic gray links

aggroNATION reference:
resources/aggroNATION-main/components/home/ContentCard.tsx:44-64 — real thumbnail or fallback
resources/aggroNATION-main/components/home/ContentCard.tsx:95-105 — #tag pills
resources/aggroNATION-main/components/home/SourceBadge.tsx:12-21 — source badge overlay
resources/aggroNATION-main/config/type-visuals.ts:4-21 — render-time fallback contract
```

## Impact Assessment

### Affected Components

- `assets/thumb.jpg` — supplied fallback artwork, committed as a source asset.
- `lib/content/format.ts` — shared kind and deterministic topic pill classes.
- `components/content/content-media.tsx` — local fallback image and source
  badge overlay.
- `components/content/content-card.tsx` — always render the media frame for
  non-compact cards and use shared kind/topic pill styling.
- `app/signal/[id]/page.tsx` — shared kind pill and colored `#tag` detail pills.
- `tests/content-format.test.mjs` — deterministic style-contract coverage.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: A wrong asset import, unstable color selection, or incorrect
  wrapping could degrade every public Signal card without affecting storage or
  inference billing.
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Use a static import of `assets/thumb.jpg` in the existing client media component;
the Next.js App Router image guide supports static image imports and the current
component already uses a CSS background for remote images. Resolve the displayed
image once as `thumbnailUrl || fallbackImage.src`, so real source and GitHub
images retain their current behavior and null or empty media uses the supplied
asset.

Move the existing kind color map into the shared content format module and add a
small deterministic tag-palette helper there. The helper returns literal class
strings from a fixed palette selected by a stable normalized-tag hash; it does
not use random state, inline arbitrary user CSS, or a remote classifier. Reuse
these helpers in cards and the detail page. Add the aggroNATION-style source
badge inside `ContentMedia`, and render `#${tag}` in topic links while preserving
the existing route and normalized slug.

### Steps

1. **implemented** — Record and converge the FID against the gateway code, the
   supplied image, the aggroNATION reference, and the Next.js static-image
   guidance.
2. **implemented** — Add the shared visual helpers, fallback media, source
   badge, and card/detail topic pills in commit `3436a4d`.
3. **implemented** — Add focused deterministic formatting tests and run the
   public Signal smoke check plus repository gates.

### Verification

- `assets/thumb.jpg` exists and is the local fallback source; a production build
  successfully resolves the static import.
- A card with `thumbnailUrl: null`, `videoId: null`, and no GitHub facts still
  renders `ContentMedia` with the fallback image; a card with a real thumbnail
  still uses that URL.
- Kind classes are stable and shared; topic class selection is deterministic for
  repeated `ai-agents` calls and varies only by the fixed palette.
- Card tags show the bounded three-item `#tag` preview; detail tags show every
  stored tag, wrap, and link to the normalized topic route.
- `/signal?kind=discussion` and a discussion detail request return HTTP 200 with
  no storage error, visible fallback/badge/pill markers, and no missing tags from
  rendering logic.
- The feature remains presentation-only: no ingestion, schema, content rows,
  reader targets, model links, billing, or provider routing change.

## Verification Gates

- `- gate: test tests/content-format.test.mjs` — `node --test tests/content-format.test.mjs`
- `- gate: test` — `npm test`
- `- gate: lint` — `npm run lint`
- `- gate: typecheck` — `npm run typecheck`
- `- gate: quality` — `npm run quality`
- `- gate: build` — `npm run build`
- `- gate: verify` — `npm run verify`

### Verification Receipt

- **verified:** 2026-11-02T23:59:00Z
- **focused test:** `node --test tests/content-format.test.mjs` — exit 0, 6/6
- **test:** `npm test` — exit 0, 848 tests (847 pass, 1 skipped)
- **lint:** `npm run lint` — exit 0, zero warnings
- **typecheck:** `npm run typecheck` — exit 0
- **quality:** `npm run quality` — exit 0, 400-line ceiling PASS (535 files)
- **build:** `npm run build` — exit 0, Next.js production build PASS
- **verify:** `npm run verify` — exit 0, 750 HTTP checks plus trial PASS and
  recovery drill PASS; the suite reports 848 tests (847 pass, 1 skipped)
- **live smoke:** `/signal?kind=discussion&tag=ai-agents` and a selected
  `/signal/[id]` discussion both returned HTTP 200 with no storage error. The
  rendered HTML contained the compiled `thumb` fallback URL, `#ai-agents`,
  colored pill classes, and `Hacker News` source labels.

## Perfection Loop

### Loop 1 — RED

- **RED:** Missing-thumbnail cards have no media, detail and card kind pills
  disagree, and discussion tags are plain gray links without the reference's
  `#tag` styling or source badge.
- **GREEN:** Reuse the existing media component, add a local static fallback,
  centralize literal kind/tag classes, and add a shared source badge.
- **AUDIT:** The reference has explicit fallback and source-badge components;
  the gateway's normalized tags and existing media/card boundaries are sufficient
  extension points without changing storage.
- **ADVERSARIAL:** A remote fallback would add a new failure domain; a random
  palette would cause hydration or visual drift; changing stored tags would
  corrupt topic queries. The design avoids all three.
- **CHANGE DELTA:** Initial FID authoring.

### Missed Questions

1. **Should the image replace real thumbnails?** No. Real source/GitHub imagery
   remains first priority; the supplied asset only fills a missing image.
2. **Should compact related cards gain large media?** No. The request concerns
   Signal item presentation; compact related cards retain their deliberate dense
   layout while sharing tag semantics where rendered.
3. **Should all stored tags be shown on grid cards?** No. The existing three-tag
   card cap keeps grids bounded; detail pages expose the complete normalized set.
4. **Should the fallback be copied into `public/`?** No. A static import keeps
   the supplied source asset as the single truth and lets Next resolve it without
   a second binary copy.
5. **Should tags be recolored or renamed in storage?** No. Styling and `#` display
   are presentation-only; normalized slugs and topic URLs stay unchanged.

### Loop 2 — Independent audit and self-correction

- **RED:** A helper defined in `lib/content/format.ts` could still be unused on
  the detail page, leaving the exact drift the request reports.
- **GREEN:** The implementation must replace the detail page's inline cyan class
  and both card/detail raw tag class blocks; call-site grep is a required gate.
- **AUDIT:** Production callers are concrete: `ContentCard` and
  `SignalDetailPage` both consume the shared formatting helpers, while
  `ContentMedia` consumes the local fallback and source label.
- **ADVERSARIAL:** `thumbnailUrl` may be an untrusted remote URL, so the fallback
  decision must only use nullish absence and must not rewrite or fetch origin
  URLs. The badge remains text-only and no untrusted HTML is introduced.
- **CHANGE DELTA:** Documentary correction only.

### Loop 3 — Final convergence

- **RED:** Static image imports in a client component can fail if the asset is
  absent or the type/build path is wrong; the supplied image is currently
  untracked and must be explicitly included in the implementation commit.
- **GREEN:** Verify the asset path before editing, include `assets/thumb.jpg`
  explicitly, and require `npm run build` plus a live discussion route smoke.
- **AUDIT:** The Next.js guide documents static imports; the source asset exists
  at the exact path, and the existing project already imports local image paths
  through configuration. The style helpers will use only literal class strings.
- **ADVERSARIAL:** The fallback must not appear on a compact related card, must
  not hide a GitHub image, and must not alter tag counts/order. These are explicit
  acceptance checks.
- **CHANGE DELTA:** 0% after final audit; record converged for implementation.

## Implementation Evidence

- [x] **Commit SHA:** `3436a4d` — `feat(signal): add fallback artwork and styled pills (FID-2026-1102-115)`
- [x] **File:line ranges:** `assets/thumb.jpg`; `components/content/content-media.tsx:7-10,20-31,68-84`; `components/content/content-card.tsx:23-31,36,69-79`; `lib/content/format.ts:30-66`; `app/signal/page.tsx:10,220-238`; `app/signal/[id]/page.tsx:16-22,129-167`; `tests/content-format.test.mjs:5-13,68-71`
- [x] **Gate output:** the Verification Receipt above records the focused test,
  full test suite, lint, typecheck, quality, build, verify, and live route
  smoke results.
- [x] **Reproducibility:** production call-graph grep finds `kindPillClass` and
  `tagPillClass` in both Signal list/detail surfaces and `ContentMedia` in
  `ContentCard`; the compiled live HTML contains the fallback asset URL.
- [x] **Step statuses:** every Proposed Solution step is implemented.

## Resolution

- **Closed Date:** 2026-11-02 19:00
- **Fix Description:** Signal's non-compact cards now always render the supplied
  local fallback when no origin image exists, with a source badge. Kind colors
  and deterministic tag colors are shared across list, topic, card, and detail
  surfaces; topics display as `#tag` links without changing storage.
- **Tests Added:** Yes — `tests/content-format.test.mjs` covers the shared kind
  and stable topic pill contracts.
- **Verification Evidence:** Focused and full tests, lint, typecheck, quality,
  production build, full verify, and live discussion list/detail smoke all pass;
  see the Verification Receipt above.
- **Archived:** 2026-11-02 19:00 — moved to
  `dev/fids/archive/FID-2026-1102-115-signal-visual-parity.md`.

## Lessons Learned

Visual parity is easiest to maintain when fallback media, source identity, and
semantic kind/tag styles are shared presentation contracts rather than repeated
per-page classes. Keep visual fixes at render time so ingestion and topic data
remain truthful and stable.
