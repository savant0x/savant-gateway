import type { ReactNode } from "react";

import { DocsNav, type DocsSection } from "./docs-nav";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export function DocsPage({
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  active: DocsSection;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              {description}
            </p>

            <DocsNav active={active} />
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
