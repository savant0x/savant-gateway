# FID: One brand-image directory and complete page metadata

**Filename:** `FID-2026-1030-063-brand-images-and-metadata.md`
**ID:** FID-2026-1030-063
**Parent:** FID-2026-1030-061
**Severity:** low
**Status:** implemented — verified against a disposable production server
**Created:** 2026-10-30
**Automation level:** 3
**YAGNI-Compliance:** Verified — one directory, one list, one new derived asset.

## Summary

Brand artwork was split across two directories with byte-identical copies
(`assets/` masters and `public/` served files), the paths were hardcoded in four
components, two stylesheets and the root metadata, and the site had **no social
preview at all**: no `openGraph` or `twitter` metadata, and no 1200×630 image.
Replacing artwork therefore meant finding every reference, and sharing a link
produced a bare URL. Consolidate every referenced image into `public/images/`,
name it once in `config/images.ts`, generate the web manifest from that same
list, and add a real social card that new artwork can replace in place.

## Environment

- OS: Windows (Git Bash), Node 22.18.0
- Next.js 16.4.3 App Router, React 19.3.0
- `sharp` resolved from Next's image pipeline (no new dependency declared)
- Commit/State: implemented and pushed on `main` as `4ad9a21`

## Detailed Description

### Problem

- `assets/` and `public/` both held `logo.png`, `logo-32.png` and the favicon
  set at identical byte sizes; `assets/favicon/site.webmanifest` was an empty
  template (`"name": ""`) that was never served.
- `public/site.webmanifest` duplicated the icon list that `app/layout.tsx`
  already declared, so the two could drift.
- `app/layout.tsx` declared no `openGraph`, no `twitter` and no `metadataBase`,
  so every share of every page was a bare URL.
- No 1200×630 asset existed anywhere in the repository.

### Expected behavior

Every image the app or README references lives in one directory at a fixed
name; one module lists those names for metadata, the manifest and components;
the social preview exists and is regenerable from a committed source.

### Root cause

The `public/` copies were published from `assets/` by hand (FID-003, FID-035),
which left the masters in place as duplicates rather than as the single source.

## Impact Assessment

Presentation and shareability only. No billing, gateway, session or policy path
is touched. The one behavioral surface is `/manifest.webmanifest`, which is now a
generated route rather than a static file: it inherits the instrumentation
config gate that already governs every other route, and serves
`application/manifest+json`.

## Proposed Solution

### Approach and steps

1. Move every referenced image into `public/images/`, deleting the byte-identical
   `assets/` duplicates and the dead manifest templates.
2. Add `config/images.ts` as the single list of paths, sizes and alt text.
3. Point `app/layout.tsx` at that list; add `metadataBase`, `openGraph` and
   `twitter` (`summary_large_image`).
4. Replace `public/site.webmanifest` with `app/manifest.ts` generated from the
   same module.
5. Draw `public/images/og.svg` (1200×630, brand palette) and add
   `scripts/render-images.mjs` + `npm run images` to rasterise it.
6. Update the four components and two stylesheets to the new paths.
7. Point the README hero at `public/images/banner.svg` and document the directory.

### Verification

`npm run check`, `npm test`, `npm run build`, then a disposable production server
(`GATEWAY_DISPOSABLE_START=yes`) to confirm the manifest and every image resolve.

## Verification Gates

- gate: `npm run check`
- gate: `npm test`
- gate: `npm run build`
- gate: production server fetch of `/manifest.webmanifest` and `/images/*`

## Perfection Loop

- **RED:** `app/layout.tsx` had no social metadata; `grep` found `/logo.png`
  hardcoded in four components and `/bg-pattern.webp` in two stylesheets.
- **GREEN:** consolidation, module, metadata, manifest route, social card.
- **AUDIT:** the rendered head and the served manifest were read back from a
  production build rather than trusted from source.
- **ADVERSARIAL:** asked whether moving the manifest from `public/` to a route
  changes failure behavior. It does: a production process with invalid
  configuration now fails `/manifest.webmanifest` with the rest of the app
  instead of serving a manifest beside 500s. In a correctly configured
  deployment both are 200, so the stricter coupling is the preferable one.
- **SELF-CORRECT:** the first rasterisation was checked by eye — text rendered
  from system fonts, so the script notes that a re-render on another machine may
  differ in glyph shapes even though layout is identical.

## Resolution

Implemented and verified. `public/` now contains exactly `images/`.

## Implementation Evidence

- `git mv` moved ten files into `public/images/`; `icon-192.png`/`icon-512.png`
  are the former `android-chrome-192x192.png`/`512x512.png`, which is the only
  rename.
- `npm run images` → `public\images\og.svg -> public\images\og.png (1200x630,
  83 KB)`; metadata reports 1200×630, PNG, no alpha.
- `npm run check` exit 0; `npm test` exit 0 with 312 passing.
- `npm run build` exit 0; `/manifest.webmanifest` listed as a static route.
- Disposable production server: `/manifest.webmanifest` 200
  `application/manifest+json` with `/images/icon-192.png` and
  `/images/icon-512.png`; `/images/og.png` 200 `image/png`;
  `/images/banner.svg` 200 `image/svg+xml`; `/images/favicon.ico` 200
  `image/x-icon`; `/terms` 200 `text/html`.
- Prerendered head carries `og:image`/`og:image:width`/`og:image:height`/
  `og:image:alt`, `twitter:card=summary_large_image`, three `rel="icon"` links,
  `apple-touch-icon` at 180×180 and `rel="manifest"`.
- `sharp` was already resolvable through Next; `package.json` gained only the
  `images` script.
- Committed as `4ad9a21` (39 files): the pre-push gate re-ran the full verify and
  accepted the refs. CI run 41125090006 is green (lint, typecheck, test, quality,
  build, `test:http`) and attribution-guard run 41125090105 is green.

## Remaining Gates

- **`assets/bg_pattern.jpg` was left in place** (2.3 MB, 2048×2048). It is the
  only surviving source for `bg-pattern.webp` and has no duplicate, so it was not
  deleted; it is not served and not referenced. Delete it if the texture is ever
  redrawn.
- `logo.png` is an 888 KB raster used at 36 px. Next optimises the delivery, so it
  is a repository-weight issue rather than a page-weight one; a new square mark
  should ship at 512 px.
- No step tests share-card rendering on a real crawler. The tags and the image are
  verified; how a specific platform crops 1200×630 is not.

## Lessons Learned

Two directories that hold the same bytes will drift, and the manifest is a
duplicate list by default — generating it from the metadata module is what makes
the icon set unarguable. A repository can pass every gate while having no social
preview, because nothing in CI inspects the head of a rendered page.
