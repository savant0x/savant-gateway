# FID: Per-page social cards from page data

**Filename:** `FID-2026-1030-064-per-page-social-cards.md`
**ID:** FID-2026-1030-064
**Parent:** FID-2026-1030-063
**Severity:** low
**Status:** implemented — verified against a disposable production server
**Created:** 2026-10-30
**Automation level:** 3
**YAGNI-Compliance:** Verified — two pages, one shared layout, no card builder framework.

## Summary

FID-063 gave the site one social card, which every page inherited. The two pages
most likely to be shared — the model catalog and the API reference — therefore
advertised a generic strip instead of what the page actually contains. Add
per-segment `opengraph-image` routes rendered by `next/og` from each page's own
data, and stop the root metadata from overriding per-page titles and canonical
urls.

## Environment

- OS: Windows (Git Bash), Node 22.18.0
- Next.js 16.4.3 App Router, `next/og` (satori + resvg), `runtime = "nodejs"`
- Commit/State: working tree on `main` after `6751513`, uncommitted

## Detailed Description

### Problem

`/models` and `/docs` both emitted `og:image = /images/og.png`, and the root
`openGraph.title` / `openGraph.url` were fixed at `"Savant Gateway"` and `"/"`,
so every page in the site claimed one title and one url regardless of its own
metadata. A shared catalog link said nothing about the catalog.

### Expected behavior

A crawler fetching `/models` receives a card whose text is drawn from the catalog
the page renders, with the page's own title; `/docs` likewise.

### Root cause

Card metadata was declared once, at the root, with explicit `title` and `url`
values that override per-page resolution. No segment had a file-convention image.

## Impact Assessment

Metadata only. No gateway, billing, session or policy path is touched. The
`/models` card reads the same `getCatalogData()` call the page already makes, so
it adds one query per crawler request and nothing per user request.

## Proposed Solution

### Approach and steps

1. `lib/social-card.tsx` — one satori-safe layout (inline flex styles, no
   Tailwind) parameterised by eyebrow, title, subtitle and factual lines.
2. `app/models/opengraph-image.tsx` — counts from `getCatalogData().stats`.
3. `app/docs/opengraph-image.tsx` — the documented endpoint surface.
4. Root metadata: drop `openGraph.title`, `openGraph.url` and `twitter.title` so
   page titles resolve properly; keep the site card as the default image.
5. Each carded page sets `twitter: { card: "summary_large_image", images: [] }`
   so Twitter falls back to the page's `og:image` instead of the inherited site
   card. The card type is restated because a partial `twitter` object otherwise
   downgrades the card to the small summary variant — a mistake this change made
   first and FID-2026-1030-065's gate then caught.

### Verification

Build the app, serve it with `GATEWAY_DISPOSABLE_START=yes`, read the emitted
head for both pages, and fetch both card routes.

## Verification Gates

- gate: `npm run check`
- gate: `npm test`
- gate: `npm run build`
- gate: production fetch of `/models/opengraph-image` and `/docs/opengraph-image`

## Perfection Loop

- **RED:** emitted head showed `og:image = /images/og.png` and
  `og:title = "Savant Gateway"` on `/models`.
- **GREEN:** two card routes, shared layout, corrected root metadata.
- **AUDIT:** read the rendered head and both PNGs back from a running production
  build rather than trusting the source.
- **ADVERSARIAL:** the first build reported `/models/opengraph-image` as **static**.
  That would have frozen whatever the build's database held — the build machine
  had 34 models, a deploy could easily bake 0 — and the card would then disagree
  with the page after every provider sync. Added `dynamic = "force-dynamic"` and
  proved it: the same route against an empty database renders `0 models`.
- **SELF-CORRECT:** also caught that `twitter:image` still pointed at the site
  card while `og:image` pointed at the page card, which is the exact
  inconsistency the change was meant to remove.

## Resolution

Implemented and verified. `/docs` stays static (its content is static); `/models`
is per-request.

## Implementation Evidence

- `npm run check` exit 0; `npm test` exit 0 with 312 passing; `npm run build`
  exit 0.
- Route table: `○ /docs/opengraph-image`, `ƒ /models/opengraph-image`.
- `/models` head: `og:title "Model catalog - Savant Gateway"`,
  `og:image "…/models/opengraph-image?e50c4563aa2ac47f"`, no `og:url`, no
  `twitter:image` (falls back to the page card).
- `/docs` head: same shape with `og:title "API reference - Savant Gateway"`.
- `/terms` still serves `og:image = /images/og.png` and now carries
  `og:title "Terms of service - Savant Gateway"`.
- Both card routes returned `200 image/png` (76 KB and 78 KB).
- Rendered PNGs inspected: text renders through the bundled font, nothing
  clipped; the build-produced catalog card read `34 models`, the runtime one
  against an empty database read `0 models`, and both are truthful.

## Remaining Gates

- No crawler was used. The tags and the images are verified; how X, LinkedIn or
  Slack crop or cache 1200×630 is not.
- Cards are Latin-only: `next/og`'s default font has no CJK coverage, and model
  names are truncated into the title rather than wrapped.
- `/compare` still inherits the site card. Its content is a user-chosen pair, so
  a card would need a per-query route; not worth it yet.

## Lessons Learned

A file-convention image route looks static by default even when the page it
serves is `force-dynamic` — check the route table, not the page. And root-level
`openGraph.title`/`url` silently defeat per-page metadata for the whole site,
which is easy to miss because the tags look correct on the home page.
