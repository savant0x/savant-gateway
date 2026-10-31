import type { MetadataRoute } from "next";

import { siteOrigin } from "@/config/site";

/** The canonical origin is a runtime environment value, not a build constant. */
export const dynamic = "force-dynamic";

/**
 * Canonical public pages only. Signup, login, account, admin, dashboard and
 * the API surfaces are either noindex or private; policy version routes
 * canonicalise to the stable current-policy pages, so they are not repeated.
 */
const PUBLIC_PAGES = [
  "",
  "/models",
  "/compare",
  "/docs",
  "/docs/start",
  "/docs/faq",
  "/plans",
  "/support",
  "/legal",
  "/terms",
  "/privacy",
  "/refunds",
  "/acceptable-use",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({ url: `${siteOrigin}${path}` }));
}
