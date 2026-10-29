import Image from "next/image";
import Link from "next/link";

import { primaryCta } from "./cta";

import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050b12]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <Image
            priority
            alt=""
            className="h-9 w-9 rounded-xl ring-1 ring-cyan-300/30"
            height={36}
            src="/logo-32.png"
            width={36}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {siteConfig.name}
            </span>
            <span className="hidden text-[11px] text-muted sm:block">
              OpenAI-compatible · full catalog
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {siteConfig.navItems.map((item) => (
            <Link
              key={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-3">
          <Link
            className="hidden px-3 py-2 text-sm text-muted transition-colors hover:text-foreground sm:block"
            href="/login"
          >
            Sign in
          </Link>
          <Link className={primaryCta} href="/signup">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
