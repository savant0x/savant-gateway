# Session summary — customer states and accessibility (FID-2026-1030-056)

**Date:** 2026-10-30
**FID:** FID-2026-1030-056
**Status:** implemented; open pending FID-061 and the remaining manual matrix
**Request:** Continue the launch sequence with 056, customer UI, public claims,
accessibility and client documentation.

## Measured gaps

- `/plans` said "Plans are not available yet" and then described a Stripe
  payment flow that cannot start, after 054 closed plan sales.
- The account subscription card offered "Compare plans" to a catalog with
  nothing purchasable, and said nothing about the launch state.
- Public documentation and payment return banners were already accurate
  (`/v1/chat/completions` only; credit/access deferred to the signed webhook),
  but no automated or browser receipt proved the future release candidate.

## Change

- `app/plans/page.tsx` — payment explanation renders only with a purchasable
  plan.
- `components/account/subscription-card.tsx`, `app/account/page.tsx` — no-plan
  state states that plans are not on sale and omits the dead CTA; comped
  subscriptions render unchanged.
- `scripts/http-suite/checks.mjs` — server-rendered matrix for `/`, `/models`,
  `/plans`, `/docs`, the signed-in no-plan account and both payment returns.

## Verification (actually run)

```text
npm run verify: exit 0
  lint: zero warnings          typecheck: exit 0
  tests 297 / pass 297         quality: PASS (400-line ceiling, 267 files)
  production build: clean      http-suite: 351 checks PASS
  trial-http-suite: all checks PASS
```

Browser receipt, production build on a disposable `DB_PATH`, 2026-10-30:

- `/plans`, `/models`, `/docs` at 390×844 and `/plans` at 1440×900 →
  `scrollWidth − clientWidth = 0`, one `h1`, `lang="en"`, skip link present.
- Dark `/plans`: body contrast 17.14:1, muted 8.97:1.
- Signed-in account at 390 and 1440: no overflow, one `h1`, "No plan is
  attached", "Plans are not on sale during this launch", no "Compare plans".
- Typing into the key-name field changed its value, confirming hydration.
- Focus ring: the `:focus-visible` outline and `prefers-reduced-motion` rules
  exist in `styles/savant.css`; a computed outline reading was inconclusive
  because the automation panel drops window focus between steps.

## Not claimed

- No policy, privacy, terms or support routes exist; that is 061, a declared
  dependency, so footer links are unchanged.
- 320 and 1024 widths, both themes on every page, admin screens and a keyboard
  focus-ring receipt are not covered.
- No real payment was completed; the copy is verified truthful, not the flow.
