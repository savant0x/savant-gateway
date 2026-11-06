const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

/** Absolute origin, read at request time by the sitemap and robots routes. */
export const siteOrigin = siteUrl.replace(/\/+$/, "");

export const siteConfig = {
  name: "Savant Gateway",
  shortName: "Savant",
  provider: {
    name: "Savant Gateway",
    slug: "savant-gateway",
  },
  tagline: "Frontier models. Grounded prices.",
  description:
    "Compare available GPT, Claude, and other model families through one OpenAI-compatible Chat Completions API.",
  url: siteUrl,
  navItems: [
    { label: "Models & pricing", href: "/models" },
    { label: "Signal", href: "/signal" },
    { label: "Compare", href: "/compare" },
    { label: "Docs", href: "/docs" },
    { label: "FAQ", href: "/docs/faq" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Quick start", href: "/#quickstart" },
  ],
  consoleHref: "/dashboard",
  accountHref: "/account",
  loginHref: "/login",
  signupHref: "/signup",
  adminHref: "/admin",
} as const;
