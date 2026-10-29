# Current theme

Inter sans; Fira Code monospace. Public canvas #050b12, code/footer #03080d,
cyan-300 accents, slate-100 text, white/10 borders. Most panels have 16–24px
corners and translucent white fills. Hero text reaches 60px desktop; page
titles are generally 30–36px. Max content width 1280px, 16/24/32px gutters.
Tailwind default breakpoints sm 640, md 768, lg 1024, xl 1280. HeroUI default
semantic theme tokens remain largely uncustomized. No Tailwind config file;
Tailwind 4 CSS-first configuration.

## Source: styles/globals.css

```css
@import "tailwindcss";
@import "@heroui/styles";
@custom-variant dark (&:is(.dark *));
@theme inline {
  --font-sans: var(--font-inter);
  --font-mono: var(--font-fira-code);
}
:root { color-scheme: dark; }
html { scroll-behavior: smooth; }
body { min-height: 100vh; background: var(--background); color: var(--foreground); }
::selection { background: color-mix(in oklab, var(--accent) 35%, transparent); }
.mono { font-family: var(--font-mono); }
.hero-glow {
  background:
    radial-gradient(circle at 12% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 34rem),
    radial-gradient(circle at 92% 8%, color-mix(in oklab, var(--accent) 9%, transparent), transparent 28rem);
}
.data-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.data-table th { padding: 0.65rem 0.75rem; text-align: left; font-weight: 500; color: var(--muted); white-space: nowrap; }
.data-table td { padding: 0.7rem 0.75rem; border-top: 1px solid color-mix(in oklab, var(--border) 70%, transparent); vertical-align: middle; }
.data-table th.text-right, .data-table td.text-right { text-align: right; }
.data-table tbody tr:hover { background: color-mix(in oklab, var(--surface) 55%, transparent); }
.scroll-shell { overflow: auto; scrollbar-width: thin; }
.step-number { display: inline-flex; width: 1.35rem; height: 1.35rem; align-items: center; justify-content: center; border-radius: 999px; background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); font-size: 0.7rem; font-weight: 600; }
```

## Fonts and theme provider

```tsx
// config/fonts.ts
import { Fira_Code as FontMono, Inter as FontSans } from "next/font/google";
export const fontSans = FontSans({ subsets: ["latin"], variable: "--font-inter" });
export const fontMono = FontMono({ subsets: ["latin"], variable: "--font-fira-code" });
```

```tsx
// app/providers.tsx
"use client";
import type { ThemeProviderProps } from "next-themes";
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
export interface ProvidersProps { children: React.ReactNode; themeProps?: ThemeProviderProps; }
export function Providers({ children, themeProps }: ProvidersProps) {
  return <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>;
}
```
