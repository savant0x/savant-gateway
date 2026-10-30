import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-border">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <BrandMark />
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-6 font-mono text-[11px] text-muted"
          >
            <Link href="/models">Models &amp; pricing</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/support">Support</Link>
            <Link href="/account">Account</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t border-border pt-6 font-mono text-[10px] text-muted">
          <span>
            SAVANT ECOSYSTEM <span className="text-accent">{"// GATEWAY"}</span>
          </span>
          <span>
            Independent gateway · not affiliated with upstream providers.
          </span>
        </div>
      </div>
    </footer>
  );
}
