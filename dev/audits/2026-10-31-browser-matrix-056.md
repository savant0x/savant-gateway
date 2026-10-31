# Browser matrix receipt — FID-2026-1030-056

**Date:** 2026-10-31
**Scope:** residual accessibility and responsive matrix for the customer surface
**Result:** 132/132 page checks pass.

## Method

- Production build (`next start`) on a disposable SQLite database.
- One seeded paid catalog model and provider; a signed-up customer session and
  an authenticated admin session.
- Playwright 1.55 driving the installed Microsoft Edge runtime headless.
- Each route loaded at 320x844 and 1024x900 in both themes. The theme was set
  through the same `localStorage` key `next-themes` reads and verified from the
  resolved `html` class and computed `color-scheme`.
- Per page: HTTP 200, `lang="en"`, exactly one `h1`, a skip link targeting
  `#main-content`, no horizontal document overflow, body contrast at least 4.5:1,
  and a visible keyboard focus ring.

## Routes

**Public (18):** `/`, `/models`, `/compare`, `/plans`, `/docs`, `/docs/start`,
`/docs/faq`, `/support`, `/terms`, `/privacy`, `/refunds`, `/acceptable-use`,
`/legal`, `/legal/v1/terms`, `/legal/v1.1/privacy`, `/signup`, `/login`,
`/recover`.

**Account (1):** `/account`.

**Admin/dashboard (14):** `/admin`, `/admin/login`, `/admin/analytics`,
`/admin/catalog`, `/admin/customers`, `/admin/gateway`, `/admin/groups`,
`/admin/plans`, `/admin/pricing`, `/admin/providers`, `/admin/reconciliation`,
`/admin/subscriptions`, `/admin/support`, `/dashboard`.

## Results

- 33 routes x 2 widths x 2 themes = **132 checks, 132 pass**.
- Every route returned 200; the admin pages all rendered with the session.
- Every page had exactly one `h1`, a skip link, the requested theme
  (`dark`/`light` class and `color-scheme` agreed), and no document overflow at
  either width.
- Minimum body contrast across the matrix: **14.03:1**.
- Keyboard Tab focused the skip link with `outline-style: solid`,
  `outline-width: 2px`, `outline-color: rgb(0, 251, 255)` in dark mode. The
  earlier session could not read this because the automation panel removed
  window focus; this run resolves it.
- `/compare` rendered "Nothing to compare yet" with the one-model fixture. That
  is the truthful empty state, not a comparison receipt.

## Limitations

- This is a disposable local production build, not the deployed origin. The same
  matrix has not run against a public host.
- No real payment was made. Card top-ups are closed by operator ruling; the
  NOWPayments lane smoke is operator territory (FID-2026-1031-076).
- It does not replace `tests/compare.test.mjs` for comparison math or the HTTP
  suite for route behavior; it is the browser/theme/focus receipt FID-056
  required.
- The local machine-readable result lives in the gitignored
  `data/browser-matrix.json`; this receipt records the measured summary.
