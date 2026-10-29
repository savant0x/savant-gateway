import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

import { siteConfig } from "@/config/site";

const CONSOLE_NAV = [
  { label: "Models", href: "#models" },
  { label: "Keys", href: "#keys" },
  { label: "Usage", href: "#usage" },
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-background/80 backdrop-blur-xl dark:border-white/10">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <Image
            alt=""
            className="h-9 w-9 rounded-xl ring-1 ring-cyan-400/30"
            height={36}
            src="/logo-32.png"
            width={36}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {siteConfig.name}
            </span>
            <span className="hidden truncate text-xs text-muted sm:block">
              Operator console
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {CONSOLE_NAV.map((item) => (
            <a
              key={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <Link
            className="hidden rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground sm:block"
            href="/"
          >
            Site
          </Link>
          <Link
            className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
            href={siteConfig.adminHref}
          >
            Admin
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
