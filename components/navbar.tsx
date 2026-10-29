import Link from "next/link";

import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

const CONSOLE_NAV = [
  { label: "Models", href: "#models", icon: "fa-layer-group" },
  { label: "Keys", href: "#keys", icon: "fa-key" },
  { label: "Usage", href: "#usage", icon: "fa-wave-square" },
] as const;

export function Navbar() {
  return (
    <header className="site-chrome">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-4 text-sm text-muted">
            <Link href="/admin">
              <i aria-hidden className="fa-solid fa-shield-halved mr-2" />
              Admin
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <nav
          aria-label="Console navigation"
          className="flex flex-wrap gap-6 border-t border-border py-3 font-mono text-[11px] text-muted"
        >
          {CONSOLE_NAV.map((item) => (
            <a key={item.href} href={item.href}>
              <i
                aria-hidden
                className={`fa-solid ${item.icon} mr-2 text-accent`}
              />
              {item.label}
            </a>
          ))}
          <Link href="/models">Public catalog</Link>
        </nav>
      </div>
    </header>
  );
}
