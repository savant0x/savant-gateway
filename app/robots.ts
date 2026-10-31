import type { MetadataRoute } from "next";

import { siteOrigin } from "@/config/site";

/** The canonical origin is a runtime environment value, not a build constant. */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/admin", "/dashboard", "/api/", "/v1/"],
      },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
