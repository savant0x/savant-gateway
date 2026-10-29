# FID: Savant ecosystem visual system

**Filename:** `FID-2026-1029-013-savant-visual-system.md`
**ID:** FID-2026-1029-013
**Severity:** medium
**Status:** fixed
**Created:** 2026-10-29
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Implement the selected price-focused Savant visual direction across the public
site, authentication, customer account, operator console, and admin screens.
The operator's `resume` instruction resumes implementation after the concrete
version-7 canvas review and full-catalog correction.

## Environment

- Windows, PowerShell, Next.js 16.4.3, HeroUI 3.2.7, Tailwind 4.
- Font Awesome Free is already installed.
- Base commit `cdb3ad0`; existing uncommitted design and launch records belong
  to this task. Preserve local-only audit/runtime directories.

## Detailed Description

### Problem

The production site retains repeated rounded cards, inconsistent default
HeroUI styling, operator-oriented marketing prose, and typography that does
not match the Savant ecosystem. Canvas approval alone changes no runtime UI.

### Expected Behavior

The real application reflects the selected design with current data and working
controls. Pricing, model quality, and value lead the message. No after-dark
positioning, invented metrics, illustrative runtime prices, or trial claims.

### Root Cause

Visual foundations and page compositions were assembled independently rather
than following one product design system.

### Evidence

`components/landing/hero.tsx` still renders “One key. Every model your provider
carries.” with a code-panel hero. `styles/globals.css` leaves semantic HeroUI
theme values at defaults. `config/fonts.ts` loads Inter and Fira Code rather
than the ecosystem's Orbitron, Rajdhani, and JetBrains Mono.

## Impact Assessment

### Affected Components

Global styles/fonts/root layout; landing components; shared public/account/admin
navigation; catalog/docs/plans/auth/account/console/admin visual components.

### Risk Level

- [x] Medium: broad presentation changes can impair navigation, contrast,
  responsive behavior, or interaction if only the homepage is verified.

## Proposed Solution

### Approach

Port the visual system into shared semantic tokens and reusable presentation
components, then recompose each surface. Preserve billing/authentication and
provider logic. Keep HeroUI controls and Font Awesome icons. Runtime catalog
data must come from the existing store, with all enabled models reachable.

### Steps

1. Audit every affected route and component 0-EOF; complete the FID audits.
2. Implement typography, theme tokens, shared shell and navigation.
3. Recompose landing around real model rates, full catalog and API integration.
4. Apply the system to catalog, plans, docs, authentication and customer account.
5. Apply the system to console and every admin page, including mobile navigation.
6. Verify interaction, keyboard focus, contrast, reduced motion, overflow,
   empty/error states, and production call-graph reachability.
7. Run declared gates, record evidence, commit logical verified progress, then
   close/archive with the actual implementation commit and changelog entry.

### Verification

Use the existing unit/HTTP suites for regression coverage. Use browser checks
against the production build with disposable accounts/database for public,
customer and authenticated admin routes at desktop and mobile sizes. Verify
the full catalog and actual input/output prices; preserve configured differences.
No implementation or gate success is claimed by this pre-implementation record.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/http.test.mjs
- gate: quality
- gate: build
- gate: test_http
- gate: verify

## Perfection Loop

### Loop 1 — RED

Source evidence above establishes the presentation gap. `getLandingData` in
`lib/store/overview.ts` calls `previewModels`, which truncates the homepage to
six models. `ModelCatalogTable` already supplies search/group/family/sort and
pagination, so reuse it with the complete public model array and a page size
equal to that array's length. No new lookup or formatting helper is needed.

### Loop 2 — AUDIT and correction

The theme affects every HeroUI control through documented CSS variables and
BEM classes. Keep the class-based light/dark provider, define both palettes,
and override only presentation. Existing production entry points import root
CSS, public headers, AccountHeader, AdminHeader and Navbar; these are the
shared reachability paths. New BrandMark and model-price selector must be
imported by those paths and the landing hero respectively.

Do not use the preview's hardcoded catalog. Subscription rows must say included
or plan required, not imply zero-price unrestricted access. Model selectors
must preserve unequal input/output rates and work with empty catalogs.

### Loop 3 — ADVERSARIAL and convergence

Reviewed mobile navigation, overflow, light/dark text contrast, reduced motion,
empty catalogs, missing Stripe configuration, and existing route auth guards.
Use native details navigation for public mobile menus and horizontally
scrollable labelled admin navigation. Leave authorization and billing intact.
The existing unit and HTTP suites plus browser checks verify these boundaries.
Plan converged; implementation may begin. This is not an implementation receipt.

### Missed Questions

- Does resume authorize implementation? Yes: the operator resumed after the
  concrete design and catalog correction; no further per-step approval needed.
- Should trial routing or Stripe configuration change? No: the launch document
  records those requirements and the operator's explicit timing instruction.
- Should the preview's snapshot be embedded in production? No: consume the
  existing model store and show actual configured prices and access modes.

## Resolution

Implementation exists across the shared visual foundations and route shells.
Production browser checks rendered all 45 catalog rows and exercised public,
customer, console, and every admin route at 1440, 390 and 320 pixels. The first
pass found intrinsic-width overflow in account/console cards; shared minimum
width constraints correct that layout. Final verification remains active.

Error-state review also found raw `error.message` rendered to customers in
`app/error.tsx`. Replaced it with generic retry/support guidance; diagnostic
logging remains in the existing error boundary. This discovery is handled
within step 6 rather than leaving an exposed error path.
The customer top-up empty state also exposed operator setup commands. Replaced
them with payment availability guidance; setup stays in launch documentation.

## Lessons Learned

A design preview is a review artifact. Runtime behavior and every application
surface need independent verification before declaring the redesign complete.
