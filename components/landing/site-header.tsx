import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="site-chrome">
      <div className="public-nav mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <BrandMark />
        <nav aria-label="Main navigation" className="public-nav-links">
          {siteConfig.navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Link className="nav-utility" href="/login">
            Sign in
          </Link>
          <details className="mobile-nav">
            <summary>Menu</summary>
            <nav aria-label="Mobile navigation">
              {siteConfig.navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link href="/login">Sign in</Link>
              <Link href="/account">Account</Link>
            </nav>
          </details>
          <Link className="savant-cta savant-cta-primary" href="/signup">
            Get access{" "}
            <i aria-hidden className="fa-solid fa-arrow-up-right-from-square" />
          </Link>
        </div>
      </div>
    </header>
  );
}
