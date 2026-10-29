# Visual dependency trees

Backend store/auth imports are excluded from uploads. Component files remain
whole; no conditional visual branches are removed.

## / — landing

- app/page.tsx
  - components/landing/landing-page.tsx
    - components/landing/site-header.tsx
      - config/site.ts
      - components/landing/cta.ts
    - components/landing/hero.tsx
      - components/landing/code-sample.tsx
      - components/landing/cta.ts
    - components/landing/stats.tsx
      - components/dashboard/format.ts
    - components/landing/model-grid.tsx
      - components/dashboard/chips.tsx
      - components/dashboard/format.ts
    - components/landing/plans-preview.tsx
      - components/dashboard/format.ts
    - components/landing/how-it-works.tsx
    - components/landing/features.tsx
    - components/landing/quickstart.tsx
      - components/landing/code-sample.tsx
      - components/landing/cta.ts
    - components/landing/final-cta.tsx
      - components/landing/cta.ts
    - components/landing/site-footer.tsx
      - config/site.ts
- styles/globals.css
- app/layout.tsx → app/providers.tsx, config/fonts.ts, config/site.ts

## /login and /signup

- app/login/page.tsx or app/signup/page.tsx
  - components/account/auth-screen.tsx
    - config/site.ts
    - components/account/auth-form.tsx
      - components/dashboard/format.ts
      - lib/customer.ts (password bound only; no UI)
- root styles and font configuration

## /account

- app/account/page.tsx
  - components/account/account-header.tsx → logout-button.tsx, config/site.ts
  - components/account/keys-card.tsx
  - components/account/topup-card.tsx
  - components/account/subscription-card.tsx
  - components/account/billing-history.tsx
  - components/dashboard/chips.tsx and format.ts

## Admin surfaces

- app/admin/(panel)/layout.tsx
  - components/admin/admin-header.tsx
    - components/admin/admin-nav.tsx
    - components/admin/logout-button.tsx
    - config/site.ts
- app/admin/(panel)/page.tsx → components/admin/admin-panel.tsx
- analytics/page.tsx → analytics-chart.tsx, analytics-models.tsx, analytics-plans.tsx
- pricing/page.tsx → pricing-table.tsx → pricing-row.tsx → pricing-draft.ts
- providers/page.tsx → providers-panel.tsx → provider-form.tsx
- groups/page.tsx → groups-panel.tsx → group-fields.tsx
- plans/page.tsx → plans-panel.tsx → plan-fields.tsx
- subscriptions/page.tsx → subscriptions-panel.tsx
- catalog/page.tsx → models-table.tsx, group-select.tsx, model-cost-editor.tsx
- customers/page.tsx → customers-table.tsx, credit-card.tsx

Read and expand the selected admin target's real imports before its canvas call.
