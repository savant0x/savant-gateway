/**
 * Every image the site and the README reference lives in `public/images/`.
 *
 * This module is the single list of those files, so replacing artwork is a file
 * swap at a fixed name rather than a hunt through components, metadata and the
 * web manifest. Paths are served verbatim (no `next/image` optimisation step
 * rewrites them), so they must stay as written.
 *
 * Sizes are the real pixel dimensions of the committed files. If new artwork
 * arrives at a different aspect ratio, update the size here in the same commit —
 * metadata uses it for the social card.
 */
export const brandImages = {
  /** Repository hero, referenced by README.md. Not used by the app's UI. */
  banner: { src: "/images/banner.png", width: 1700, height: 949 },
  /** Social preview. Raster source of truth: `npm run images` rebuilds it. */
  social: {
    src: "/images/og.png",
    width: 1200,
    height: 630,
    alt: "Savant Gateway — an independent inference gateway with one OpenAI-compatible API",
  },
  logo: "/images/logo.png",
  logoSmall: "/images/logo-32.png",
  background: "/images/bg-pattern.webp",
  icons: {
    ico: "/images/favicon.ico",
    png16: "/images/favicon-16x16.png",
    png32: "/images/favicon-32x32.png",
    apple: "/images/apple-touch-icon.png",
    png192: "/images/icon-192.png",
    png512: "/images/icon-512.png",
  },
} as const;
