# Browser matrix receipt — FID-2026-1104-009

**Date:** 2026-11-05
**Scope:** six interaction journeys in light and dark themes against a local
production build
**Result:** 12/12 journey checks pass.

## Pinned artifact

- **Implementation commit:** `0052734e87aaa69594d4878d287c30187ab1ebc6`
- **Build ID:** `IbsGZjBu7Q51HrQ3KPfsT`
- **Runtime observed:** Windows x64, Node v24.21.0, Next.js 16.4.3
- **Browser:** Microsoft Edge via Playwright 1.55.0, headless
- **Origin:** disposable loopback production server (`next start`)
- **Database:** disposable PostgreSQL created for this run
- **Upstream:** local mock provider only

## Method

`npm run build` produced the artifact, then `npm run test:browser` ran the
runner in `scripts/browser-matrix.mjs`. The runner starts a disposable
PostgreSQL database, seeds a mock provider and catalog, creates real customer
accounts through `/api/auth/signup`, signs each account in through the real
form, and drives the built application with Playwright.

Each journey runs in both themes. The theme is written to the `next-themes`
storage key `theme` before navigation and verified from both the rendered
`html` class and computed `color-scheme`. All non-loopback requests are blocked;
the Vercel-only `/_vercel/*` telemetry path is answered with an empty script
because a local production build has no edge asset for it.

The mobile journey uses a 390x844 viewport, asserts no horizontal document
overflow, and checks that the first Tab target is the visible skip link. Other
journeys use a 1280x900 viewport. The runner fails on any page error, any app
console error, an unexpected count, a missing visible focus indicator, or a
skipped journey. Screenshots are captured only on failure and mask password
inputs and preformatted secret blocks.

## Journeys

| Journey | Light | Dark |
| --- | --- | --- |
| Mobile sign-in, key reveal and top-up entry | PASS | PASS |
| Palette open/select/Escape | PASS | PASS |
| Video dialog Escape and focus return | PASS | PASS |
| Reply | PASS | PASS |
| Reaction | PASS | PASS |
| Catalog filter and Back | PASS | PASS |

### What each check drives

- **Mobile account:** form sign-in, keyboard focus on the skip link, key
  creation, one-time secret display, the Add credit card and the Card lane
  entry point, and no 390 px overflow.
- **Palette:** Ctrl+K opens with focus in the search input; Escape closes;
  the Search button reopens; the query “Suite” returns the fixture item and
  catalog models; ArrowDown/ArrowUp/Enter selects the item and navigates.
- **Video:** Enter on the Play control opens the native dialog; Escape closes
  it; focus returns to the Play control.
- **Reply:** the reply disclosure opens, the textarea accepts a reply, and the
  posted reply appears in the discussion.
- **Reaction:** the Useful reaction starts `aria-pressed="false"` and becomes
  `aria-pressed="true"` after activation.
- **Catalog:** the “HTTP Suite Paid” filter returns one matching row, excludes
  the free fixture, opens the paid detail page, and browser Back returns to the
  catalog.

## Output

```text
browser-matrix: launching installed Microsoft Edge
browser-matrix: light mobile sign-in, key reveal and top-up entry PASS
browser-matrix: light palette open/select/Escape PASS
browser-matrix: light video dialog Escape and focus return PASS
browser-matrix: light reply PASS
browser-matrix: light reaction PASS
browser-matrix: light catalog filter and Back PASS
browser-matrix: dark mobile sign-in, key reveal and top-up entry PASS
browser-matrix: dark palette open/select/Escape PASS
browser-matrix: dark video dialog Escape and focus return PASS
browser-matrix: dark reply PASS
browser-matrix: dark reaction PASS
browser-matrix: dark catalog filter and Back PASS
browser-matrix: 12 journey checks PASS (build IbsGZjBu7Q51HrQ3KPfsT)
```

The machine-readable run is `.scratch/browser-matrix/result.json` (gitignored):

```json
{
  "schema": 1,
  "generatedAt": "2026-11-05T17:49:19.635Z",
  "baseUrl": "http://127.0.0.1:57860",
  "buildId": "IbsGZjBu7Q51HrQ3KPfsT",
  "checks": 12,
  "browser": "Microsoft Edge via Playwright"
}
```

## Reproduce

```bash
npm run build
npm run test:browser
```

The runner requires Microsoft Edge or a Playwright Chromium install. It fails
rather than skipping when no browser is usable.

## Limitations

- This is a disposable local production build, not the deployed origin or a
  hosted browser grid.
- Only Microsoft Edge headless was exercised. Firefox, WebKit, Safari and a
  headed browser were not tested.
- Themes are asserted from the rendered class and computed `color-scheme`, not
  from screenshot baselines; there is no visual-regression coverage.
- The mobile viewport is 390x844 only. Reduced-motion and high-contrast modes
  were not tested.
- The video iframe is intentionally blocked from reaching YouTube, so the
  receipt proves dialog keyboard behavior and focus return, not playback.
- Console tracking fails on app-origin console errors; messages attributed to
  blocked non-loopback resources are outside the application boundary and are
  not counted.
- No real provider inference, card payment, crypto invoice or production
  origin was used. The Card button was present and keyboard-visible, not
  clicked.
- The Vercel Speed Insights edge asset is absent locally and is stubbed by the
  fixture; its telemetry behavior is outside this receipt.
