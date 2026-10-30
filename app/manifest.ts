import type { MetadataRoute } from "next";

import { brandImages } from "@/config/images";
import { siteConfig } from "@/config/site";

/**
 * Served at `/manifest.webmanifest`. Generated from `config/images` so the icon
 * list cannot drift from the metadata links in `app/layout.tsx`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#050b12",
    theme_color: "#050b12",
    icons: [
      {
        src: brandImages.icons.png192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brandImages.icons.png512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
