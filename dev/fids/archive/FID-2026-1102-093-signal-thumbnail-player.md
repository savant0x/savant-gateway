# FID: Signal video thumbnails open a player modal

**Filename:** `FID-2026-1102-093-signal-thumbnail-player.md`
**ID:** FID-2026-1102-093
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 19:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

**Commit/State:** `a7498a1` (implementation), `main`

---

## Summary

A video card on `/signal` shows a thumbnail, but the thumbnail is a decorative
background image. Clicking it does nothing. It should play the video in a
modal, the behavior the operator remembers from the reference site.

## Detailed Description

### Problem

`ContentCard` renders the thumbnail as an `aria-hidden` `div` with a
`background-image`. Only the title and "Read and see models" are links. The
operator clicks the largest element on the card and gets no response.

### Expected Behavior

- Clicking a video thumbnail opens a modal with the YouTube embed.
- The modal closes on Escape, backdrop click, and an explicit close button.
- Focus moves into the modal and returns to the trigger on close.
- The modal links to the full Signal detail page.
- A video without a thumbnail still gets a playable placeholder.
- A non-video thumbnail navigates to the detail page.
- A malformed video id cannot become an iframe source.

### Root Cause

The thumbnail was presentation-only; no trigger, no modal, and no pure embed
URL helper.

### Evidence

```text
components/content/content-card.tsx:24
  {item.thumbnailUrl && !compact ? (
    <div aria-hidden className="h-36 w-full bg-cover bg-center" ... />
  ) : null}
```

## Impact Assessment

### Affected Components

- `components/content/content-card.tsx`
- `components/content/content-media.tsx` (new)
- `lib/content/format.ts`
- `app/signal/[id]/page.tsx`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: engagement surface only; no billing or admission path

## Proposed Solution

### Approach

Add a small client `ContentMedia` component that owns the trigger and the
portal-mounted modal. Reuse one pure `videoEmbedUrl` helper on the card and the
detail page so the embed params and id validation cannot drift.

### Steps

1. `implemented` — Add `videoEmbedUrl(videoId, autoplay)` with a charset guard.
2. `implemented` — Add `ContentMedia`: thumbnail button, play overlay, modal
   with Escape/backdrop/close, focus return, body scroll lock, full-page link.
3. `implemented` — Use it in `ContentCard`; non-video thumbnails stay links.
4. `implemented` — Use the same helper on the detail page.

### Verification

- `tests/content-format.test.mjs` — valid, invalid, and autoplay embed URLs.
- Disposable/live route check — server HTML contains the trigger button for a
  video card and the modal is not rendered until interaction.
- `npm run lint`, `npm run typecheck`, `npm run quality`, `npm run build`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-format.test.mjs
- gate: quality
- gate: build

### Verification Receipt

```text
npm run lint      exit 0, zero warnings
npm run typecheck exit 0
npm run quality   PASS (400-line ceiling, 514 files scanned)
npm run build     exit 0
node --test tests/content-format.test.mjs    5/5 pass

Live dev server GET /signal?kind=video:
  aria-label="Play …" triggers      24
  aria-haspopup="dialog" triggers   24
  embed iframes before interaction  0

Live dev server GET /signal/itm_19a5…:
  youtube-nocookie.com/embed/2BXktpaCEN4  present twice
```

Not verified: an actual pointer click and Escape/backdrop interaction. No
browser is available in this environment; the trigger and the modal are
verified structurally and by the production build, not by a click test.

## Perfection Loop

### Loop 1 — RED

- **RED:** The largest target on a video card does nothing. The reference site
  opened the player in place; ours drops the click.
- **GREEN:** `ContentMedia` makes the thumbnail a dialog trigger for videos and
  a detail link for everything else. One `videoEmbedUrl` helper validates the
  id and builds both the card and detail embeds.
- **AUDIT:** Server HTML shows 24 play triggers and zero embeds on the hub, so
  the modal is not preloading 24 iframes. The detail page still embeds its one
  video directly.
- **ADVERSARIAL:** A malformed id returns null and falls back to a normal card
  link, never an arbitrary iframe source. The modal closes on Escape, backdrop,
  and the close button, and restores focus and body scroll.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Does the thumbnail navigate or play?** It plays in a modal for videos;
   non-video thumbnails navigate to the detail page.
2. **Does the card still link to the full page?** Yes: title, CTA, and the
   modal's “Full page” link.
3. **What if there is no thumbnail?** A video card renders a gradient
   placeholder with the play affordance instead of a dead area.

### Implementation Evidence

```text
components/content/content-media.tsx   trigger + portal modal + focus/scroll
components/content/content-card.tsx    uses ContentMedia; video CTA copy
lib/content/format.ts                  videoEmbedUrl validation
app/signal/[id]/page.tsx               shared embed helper
```

### Loop 2 — Final convergence

The card, modal, and detail page now build their embeds through one helper, so
an id that cannot play is never used as a source. The modal is mounted only
while open, so the hub does not pay for 24 iframes.

## Resolution

- **Closed Date:** 2026-11-02
- **Fix Description:** video thumbnails open a portal modal player; article
  thumbnails link to the detail page; malformed video ids fall back safely.
- **Tests Added:** `videoEmbedUrl` valid/invalid/autoplay coverage in
  `tests/content-format.test.mjs`.
- **Verification Evidence:** the receipt above; commit `a7498a1`.
- **Archived:** `dev/fids/archive/FID-2026-1102-093-signal-thumbnail-player.md`.

## Lessons Learned

A decorative thumbnail is a missing affordance, not a styling choice. If the
image is the largest target on a card, it must do what the card promises.
