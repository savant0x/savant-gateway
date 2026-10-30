# FID: Brand canvas bands, wireframe bands, and a rhythm that survives data

**Filename:** `FID-2026-1029-035-brand-canvas.md`
**ID:** FID-2026-1029-035
**Severity:** low
**Status:** verified
**Created:** 2026-10-30 03:10
**Closed:** 2026-10-30 04:20
**Closure correction:** 2026-10-30 — implementation is present and fresh full
`npm run verify` exited 0, but no implementation commit exists yet. The earlier
closed labels below are historical; archive only after recording a real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one derived image, two tokens, one parity rule and
a handful of class swaps. No dependency, no data, no new page.

---

## Summary

The opening band of every public page was a flat radial glow and the footer was a
flat strip. The operator supplied a 2048 px brand pattern for that empty space and
asked for a black overlay of about 80 %, then for filled content boxes, then for
the landing page to alternate properly between the darker bands and the wireframe
bands, with the footer carrying the same band as the top. This FID adds the
pattern as a tiled canvas behind one veil, keeps the wireframe drawing on the
light bands in perspective, and derives the alternation from DOM order so an
optional section cannot leave two light bands touching.

## Environment

- **Stack:** Next.js 16 App Router, Tailwind 4 + hand-written `styles/savant.css`
  and `styles/globals.css`
- **State:** working tree on `main`; live dev server at `127.0.0.1:3000` with the
  real catalog (34 rows) and no plans configured (the plans band is absent)

## Detailed Description

### Problem

- **R1 — blank opening bands.** `.hero-glow` was two radial gradients and
  `.landing-hero` one; both read as empty space above the fold.
- **R2 — the supplied art was 2.1 MB.** `assets/bg_pattern.jpg` is 2048×2048 and
  Next does not serve `assets/`, so it could not ship as-is.
- **R3 — transparency made the pattern loud.** The stat panels and chips on
  `/models` used `bg-cyan-300/5` and `bg-white/5`, so the texture showed through
  the very type they framed.
- **R4 — copy sat on the motif.** On the landing hero the headline overlapped
  repeating wordmarks; on the closing band the centred copy overlapped portraits.
- **R5 — the rhythm was accidental.** Which landing sections were light came from
  per-component classes. The plans band is optional, and with no plans configured
  the closing CTA followed the how-it-works band, leaving two light bands in a row.
- **R6 — the drawing was flat.** The first pass gave the light bands a flat 80 px
  grid, which lost the receding perspective the closing band had and read as a
  solid panel.

### Expected Behavior

Every band is one of exactly two things: the canvas (pattern under the veil) or
the wireframe (a drawing in perspective on one step above the canvas). They
alternate, the page opens and closes dark, and neither pattern nor drawing competes
with the copy.

## Root Cause

There was no shared backdrop token and no band concept. Each section hard-coded its
own background, so a texture had to be composed everywhere by hand and the
alternation depended on which components happened to render.

## Verification Receipt

```text
$ npx eslint --fix <changed files>   clean
$ npm run typecheck                  tsc --noEmit -> pass
$ npm test                           tests 195 / pass 195 / fail 0
$ npm run build                      next build -> pass
```

Rendered checks on the dev server, 1440×1000:

```text
GET /bg-pattern.webp                 200, 1440x1440 WebP, 29 KB (source 2.1 MB)
landing bands, read from computed styles:
  1 .landing-hero          canvas   (own composition)
  2 .landing-stats         wire
  3 #models                canvas
  4 .value-surface         wire
  5 #quickstart            canvas
  6 #how-it-works          wire
  7 .closing-cta           canvas   (odd parity, drawing suppressed)
  + .site-footer           canvas
document.scrollWidth == clientWidth (1423) -> no horizontal overflow
--brand-veil #000c -> rgba(0,0,0,0.86); --brand-tile 420px
```

Screenshots: `debug/brand-canvas-hero.png`, `debug/brand-canvas-models.png`,
`debug/brand-canvas-footer.png`, `debug/bands-features-3d.png`,
`debug/bands-close-blur.png`.

## Perfection Loop

### Loop 1 — RED

R1–R6, with the rendered bands as evidence.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — the original cannot ship.** Derived `public/bg-pattern.webp` with the
  already-installed `sharp`; `assets/bg_pattern.jpg` stays the source of truth.
- **A2 — tiling scale decides whether it reads as art or texture.** 620 px put
  three half-cut wordmarks per screen; `cover` put a screen-height logo behind the
  headline; 380 px was wallpaper. Settled at 420 px.
- **A3 — the veil must be theme-neutral.** 80 % black on a light page paints a dark
  block, so the veil is a token: white by default, black under `.dark`.
- **A4 — the boxes were the loudness.** Added `.canvas-surface` (opaque,
  `accent 6%` over `--surface`) and used it on the `/models` panels and the chips
  on `/models` and `/docs`.
- **A5 — copy still overlapped the motif.** The hero and the closing band each get
  a wash between the accent glow and the veil — directional on the hero (copy on
  the left), radial on the closing band (copy centred).
- **A6 — the footer needed the band.** `.site-footer` paints the canvas, washed
  from the bottom edge so the small print never sits on a bright motif.
- **A7 — parity was data-dependent.** The alternation now comes from
  `:nth-of-type` inside `.landing-bands`, with the hero excluded because it composes
  its own layers. With no plans band, the CTA lands on the canvas parity and its
  drawing is suppressed, so the page still alternates and closes dark.
- **A8 — the first light-band grid was flat.** Restored the perspective floor
  (`rotateX(56deg)`, `scale(1.8)`, mask fading upward) with accent lines at 7 %,
  and put the band one step above the canvas
  (`color-mix(background 55%, surface)`) so it is a band, not a bright panel.
- **A9 — the pattern read as repeated logos.** The asset is blurred (σ 9) before
  encoding: at 20 % the motif is colour and shape rather than legible wordmarks
  repeating seven times across the screen. Side effect: 101 KB → 29 KB.
- **A10 — the closing band's wash lost the cascade.** The generic odd-band rule
  out-specified the CTA rule; anchored it with `section.closing-cta` and confirmed
  `::before` computes to `display: none` on the dark parity.

### Convergence

Two loops, ten corrections, every one measured on the rendered page. No item
remains that does not add a surface or an element the operator did not ask for.

## Resolution

- **Status:** closed
- **Fix Description:** `--brand-veil` (86 %, theme-aware) and `--brand-tile`
  (420 px) live on `:root`. `.brand-canvas` and `.hero-glow` compose veil + pattern
  for any empty region. On the landing page `.landing-bands` assigns canvas to odd
  bands and the perspective wireframe to even bands, so the rhythm survives a
  missing plans section. `.site-footer` closes the page with the canvas.
  `.canvas-surface` gives content inside a canvas band an opaque fill.
- **Tests Added:** none — presentation only; the covering checks are the build,
  typecheck, the suite, and the computed-style and screenshot evidence above.
- **Verification Evidence:** receipt above.

## Lessons Learned

A texture is only background if nothing translucent sits on it, and a rhythm
belongs to the container, not to each section's class list. Deriving parity from
DOM order is what made the optional plans band a non-event.
