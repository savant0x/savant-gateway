# Reusable components

## SiteHeader
- Source: `components/landing/site-header.tsx`
- Category: layout
- Description: Public navigation and real Savant brand mark.
- Extractable props: none; links and identity are fixed.
- Hardcoded: logo, navigation labels, CTA labels, spacing and colors.

## SiteFooter
- Source: `components/landing/site-footer.tsx`
- Category: layout
- Description: Brand identity, public links, and provider disclaimer.
- Extractable props: none.
- Hardcoded: logo, identity, public navigation.

## AdminNav
- Source: `components/admin/admin-nav.tsx`
- Category: layout
- Description: Operator navigation through nine management screens.
- Extractable props: activeItem (string, default overview).
- Hardcoded: Font Awesome icon names, route names, styling.

## AccountHeader
- Source: `components/account/account-header.tsx`
- Category: layout
- Description: Brand, customer identity and account navigation.
- Extractable props: none for public drafts; use synthetic customer data.
- Hardcoded: brand identity, links, logout action.

Primitive buttons, cards and fields remain inline in drafts and HeroUI in code.
