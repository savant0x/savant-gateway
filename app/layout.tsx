import "@fortawesome/fontawesome-free/css/all.min.css";
import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import clsx from "clsx";

import { Providers } from "./providers";

import { fontDisplay, fontMono, fontSans } from "@/config/fonts";
import { brandImages } from "@/config/images";
import { siteConfig } from "@/config/site";

const socialImage = {
  url: brandImages.social.src,
  width: brandImages.social.width,
  height: brandImages.social.height,
  alt: brandImages.social.alt,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  applicationName: siteConfig.name,
  description: siteConfig.description,
  icons: {
    icon: [
      { url: brandImages.icons.ico, sizes: "any" },
      { url: brandImages.icons.png32, sizes: "32x32", type: "image/png" },
      { url: brandImages.icons.png16, sizes: "16x16", type: "image/png" },
    ],
    apple: { url: brandImages.icons.apple, sizes: "180x180" },
  },
  // Title and url are deliberately left unset here: specifying them at the root
  // would repeat one title and one canonical url on every page and override the
  // per-page values that the `opengraph-image` routes are built from.
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    description: siteConfig.description,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    description: siteConfig.description,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <body
        className={clsx(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          fontSans.variable,
          fontMono.variable,
          fontDisplay.variable,
        )}
      >
        <Providers
          themeProps={{
            attribute: "class",
            defaultTheme: "dark",
            enableSystem: false,
          }}
        >
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
