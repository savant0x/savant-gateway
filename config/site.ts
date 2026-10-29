export const siteConfig = {
  name: "Savant Gateway",
  shortName: "Savant",
  tagline: "The full provider catalog, one OpenAI-compatible endpoint.",
  description:
    "An OpenAI-compatible gateway for the provider's full catalog: cost-aware pricing, hashed consumer keys, credit settlement, and usage analytics.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  navItems: [
    { label: "Models", href: "/models" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Quick start", href: "/#quickstart" },
  ],
  consoleHref: "/dashboard",
  adminHref: "/admin",
} as const;
