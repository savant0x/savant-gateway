export const siteConfig = {
  name: "Savant Gateway",
  shortName: "Savant",
  tagline: "The free-model gateway, without the reseller surface.",
  description:
    "An OpenAI-compatible gateway for upstream free models, with hashed consumer keys, streaming, and weighted usage metering.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  navItems: [
    { label: "Models", href: "/#models" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Quick start", href: "/#quickstart" },
  ],
  consoleHref: "/dashboard",
  adminHref: "/admin",
} as const;
