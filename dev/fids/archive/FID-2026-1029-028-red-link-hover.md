# FID: Fire-red link hover

**Filename:** `FID-2026-1029-028-red-link-hover.md`
**ID:** FID-2026-1029-028
**Severity:** low
**Status:** closed
**Closed Against:** `f094348`
**Archived:** 2026-10-30

Closure reconciliation: `styles/savant.css` defines the red token and applies
it to public link hover. Full `npm run verify` exited 0 on 2026-10-30 before
subsequent systems repairs. Historical visual probes below remain historical.
**Created:** 2026-10-30 05:40
**Automation level:** 3
**YAGNI-Compliance:** Verified — one token, three selectors, no new component.

---

## Summary

Every text link on the public surfaces hovered into the cyan accent, the same
colour used for active state, kickers and figures, so hover read as "selected".
Links now hover into `--red`, the fire red already carried by the `//` in the
wordmark and the stat ordinals, leaving cyan to mean structure.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, Tailwind v4 + savant.css
- **Commit/State:** `8f1d079` + working tree

## Detailed Description

### Problem

- `.public-nav-links a:hover` and `.nav-utility:hover` set `--accent`.
- Footer links, docs "on this page" links, the account nav and the hero's
  "Compare all models" had **no hover colour at all**; they either stayed muted
  or inherited a `hover:text-foreground` utility.
- The accent is doing three jobs at once: active nav item, section kicker,
  decorative rule. Hover sharing it makes a pointer state look like a selected
  state.

### Expected Behavior

- Hovering any public text link turns it fire red.
- CTAs do not change text colour on hover; their hover is a background/shadow
  treatment.
- The wordmark does not recolour on hover.
- Admin and workspace chrome keep accent hover, because there the accent is
  already the active marker and red would collide with those states.

### Root Cause

Link hover was styled per component, or not at all, before the palette had a
secondary colour.

### Evidence

```text
before  .public-nav-links a:hover { color: var(--accent) }
        footer / docs / account nav: no hover rule
after   .site-shell a:not(.savant-cta):hover,
        .auth-surface a:not(.savant-cta):hover,
        .site-chrome a:not(.savant-cta):hover { color: var(--red) }
```

## Impact Assessment

### Affected Components

- `styles/savant.css` — nav hover, link-hover rule, `.brand-mark .brand-word`

### Risk Level

Low. Presentation only. Unlayered savant.css rules outrank the `hover:*`
utilities, which is what makes the docs sidebar obey the new rule.

## Proposed Solution

### Approach

One rule for the public shells instead of chasing each component's utility
class. `.site-chrome` is included because the account header's nav lives there
rather than inside `.site-shell`. `.savant-cta` is excluded so buttons keep their
own treatment.

### Steps

1. Point the two existing nav hover rules at `--red`.
2. Add the three-selector link-hover rule beside them.
3. Pin `.brand-mark .brand-word` to `--foreground` so the identity mark does not
   recolour when the logo is hovered.

### Verification

- `npx tsc --noEmit` clean, `npx prettier --check` clean.
- Forced-red probe on `/` and `/docs`: nav, footer, docs sidebar, account nav
  and "Compare all models" all resolve to `rgb(255, 42, 109)`; the primary CTA
  keeps `rgb(3, 16, 20)` on `rgb(0, 251, 255)`; the wordmark keeps
  `rgb(228, 237, 244)` with its `//` red and `GATEWAY` cyan.

## Verification Gates

- `npx tsc --noEmit` — pass
- `npx prettier --check` — pass
- Visual: `/` and `/docs` with the hover state forced

### Verification Receipt

```text
navColor     rgb(255, 42, 109)
ctaColor     rgb(3, 16, 20)      (unchanged)
wordColor    rgb(228, 237, 244)  (unchanged)
brandSlash   rgb(255, 42, 109)
brandEm      rgb(0, 251, 255)
```

## Resolution

Public text links hover red; CTAs and the wordmark are unaffected; admin and
workspace keep accent hover.

## Lessons Learned

A single accent assigned to four states (active, hover, structure, decoration)
reads as noise. The secondary colour existed in the wordmark already; it needed
a token, not a new palette.
