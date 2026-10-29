# FID: Admin navigation rail

**Filename:** `FID-2026-1029-021-admin-nav-rail.md`
**ID:** FID-2026-1029-021
**Severity:** medium
**Created:** 2026-10-29 22:10
**Automation level:** 3
**YAGNI-Compliance:** Verified — one layout file, one CSS block, no new
dependency and no client-side navigation component.

---

## Summary

The admin control plane had no persistent navigation. Ten pages were reachable
only from a horizontal tab strip under a sticky site header, and the strip
wrapped on narrow windows. This FID moves navigation into a sticky left rail,
keeps the same `AdminNav` link list, and degrades to a horizontally scrolling
strip below 1024px.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16
- **Commit/State:** `f691848` + working tree

## Detailed Description

### Problem

`components/admin/admin-header.tsx` rendered `BrandMark`, a Console link, the
logout button, and `AdminNav` inside the site chrome. Every admin page repeated
that chrome, the active tab was styled with a 2px bottom border, and the
ten-item strip overflowed its container instead of aligning to the page.

### Expected Behavior

- Admin pages share one rail: brand, ten grouped links, Console, Sign out.
- The rail is sticky, 16rem wide, and scrolls independently of the page.
- The active page is marked with an accent rule and a tinted row, not a tab
  underline.
- Below 1024px the rail becomes a horizontal strip that scrolls in place and
  never widens the document.
- No horizontal document overflow at 390px, 1024px, or 1440px.

### Root Cause

The header was built for a marketing page and reused verbatim for the console.

### Evidence

```text
before: components/admin/admin-header.tsx  <header class="site-chrome"> ... <AdminNav/>
        styles/savant.css                .admin-tabs a { border-bottom: 2px }
after:  app/admin/(panel)/layout.tsx      <aside class="admin-rail"> ... <AdminNav/>
        styles/savant.css:131-185         .admin-shell / .admin-rail / media queries
```

## Impact Assessment

### Affected Components

- `app/admin/(panel)/layout.tsx` (new)
- `components/admin/admin-header.tsx` (deleted)
- `styles/savant.css`

### Risk Level

- [x] Medium: every admin route now renders through one layout that calls
  `requireAdminPage()`; a broken guard would expose financial pages.

## Proposed Solution

### Approach

Move the session guard into the segment layout, which already had to run on each
request, and render the rail there. The layout keeps `dynamic = "force-dynamic"`.
`AdminNav` is unchanged, so the active-link logic and icons stay in one place;
the rail only restyles it through `.admin-rail .admin-tabs`.

### Steps

1. Segment layout with `requireAdminPage()`, rail, main, footer. — implemented
2. Delete `AdminHeader` so no route renders two headers. — implemented
3. Rail CSS plus a mobile strip. — implemented
4. Mobile polish: icon-only Console below `sm`, tabs take remaining width. —
   implemented

### Verification

- `npm run lint`, `npm run typecheck`, `npm run build` — clean.
- All ten admin routes return 200 with a signed session cookie and 307 without
  one (redirect to `/admin/login`).
- Browser measurements at 1440px: grid `256px 1167px`, rail sticky, no document
  overflow. At 390px: rail height 63px, tabs scroll (`scrollWidth` 1102 inside
  198px), no document overflow.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: build
- gate: http admin routes

### Verification Receipt

```text
npm run lint       0 errors, 0 warnings
npm run typecheck  pass
npm run build      pass
/admin … /admin/analytics   200 with cookie, 307 without
390px / 1024px / 1440px     document overflow 0
```

## Perfection Loop

### Loop 1 — RED

- **RED:** Ten admin pages shared a wrapping tab strip and no persistent
  navigation.
- **GREEN:** Sticky rail in the segment layout, tabs reused as vertical links.
- **AUDIT:** Guard moved, not duplicated; `AdminHeader` deleted so no page can
  render the old chrome.
- **ADVERSARIAL:** At 390px the tabs container collapsed to 137px because the
  footer took the remaining width. Fixed by letting the tabs flex (`flex: 1 1
  auto; min-width: 0`) and hiding the Console label below `sm`.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Does the rail hide anything at 1280px? → No; it is fixed at 16rem and main is
   `minmax(0, 1fr)`, so tables scroll inside their own region.
2. Should the old `AdminHeader` stay for a route outside the group? → No route
   uses it; leaving it would be dead code that can drift.
3. Does moving the guard change the redirect? → No. `requireAdminPage()` is
   called in the layout exactly as it was called in each page's chain.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `app/admin/(panel)/layout.tsx:1-52`,
      `styles/savant.css:131-185`
- [x] Gate output — above
- [x] Reproducibility — `npm run build && npm start`, sign in at `/admin/login`
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Admin navigation renders from one sticky rail in the
  `(panel)` layout; every admin route keeps its session guard.
- **Tests Added:** No — layout and presentation only; covered by build, lint,
  route status checks, and viewport measurements.
- **Verification Evidence:** Gate receipt above.
- **Archived:** pending

## Lessons Learned

A chrome component that every page repeats is a place where a new page silently
loses navigation. The guard belongs in the layout with it, because both have to
run on every request anyway.
