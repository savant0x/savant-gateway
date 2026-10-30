export const siteConfig = {
  name: "Savant Gateway",
  shortName: "Savant",
  provider: {
    name: "Savant Gateway",
    slug: "savant-gateway",
  },
  tagline: "Frontier models. Grounded prices.",
  description:
    "Compare model prices, choose the intelligence for your workload, and connect through one OpenAI-compatible API. Prepaid usage and account-owned keys.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  navItems: [
    { label: "Models & pricing", href: "/models" },
    { label: "Compare", href: "/compare" },
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
