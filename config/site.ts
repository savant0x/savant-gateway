export const siteConfig = {
  name: "Savant Gateway",
  shortName: "Savant",
  provider: {
    name: "Savant Gateway",
    slug: "savant-gateway",
  },
  tagline: "The full provider catalog, one OpenAI-compatible endpoint.",
  description:
    "An OpenAI-compatible gateway for the full provider catalog: prepaid credit, account-owned keys, per-request usage, and Stripe-secured top-ups.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  navItems: [
    { label: "Models", href: "/models" },
    { label: "API reference", href: "/docs" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Quick start", href: "/#quickstart" },
  ],
  consoleHref: "/dashboard",
  accountHref: "/account",
  loginHref: "/login",
  signupHref: "/signup",
  adminHref: "/admin",
} as const;
