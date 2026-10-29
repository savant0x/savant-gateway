import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import clsx from "clsx";

import { Providers } from "./providers";

import { Navbar } from "@/components/navbar";
import { fontMono, fontSans } from "@/config/fonts";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
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
        )}
      >
        <Providers
          themeProps={{
            attribute: "class",
            defaultTheme: "dark",
            enableSystem: false,
          }}
        >
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-6 sm:px-6 lg:px-8">
              {children}
            </main>
            <footer className="border-t border-black/10 dark:border-white/10">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
                <span>{siteConfig.name}</span>
                <span>Local development · Next.js + HeroUI v3</span>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
