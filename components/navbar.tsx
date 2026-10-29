import { Chip } from "@heroui/react";
import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

import { siteConfig } from "@/config/site";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-background/80 backdrop-blur-xl dark:border-white/10">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-sm font-bold text-background">
            A
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {siteConfig.name}
            </span>
            <span className="hidden truncate text-xs text-muted sm:block">
              provider gateway
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {siteConfig.navItems.map((item) => (
            <a
              key={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Chip
          className="hidden sm:inline-flex"
          color="accent"
          size="sm"
          variant="soft"
        >
          HeroUI v3
        </Chip>
        <ThemeToggle />
      </div>
    </header>
  );
}
