import Image from "next/image";
import Link from "next/link";

import { LogoutButton } from "./logout-button";

import { siteConfig } from "@/config/site";

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050b12]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3" href="/">
          <Image
            alt=""
            className="h-9 w-9 rounded-xl ring-1 ring-cyan-300/30"
            height={36}
            src="/logo-32.png"
            width={36}
          />
          <span className="text-sm font-semibold">{siteConfig.name}</span>
        </Link>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
          Admin
        </span>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <a
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground"
            href="#provider"
          >
            Provider
          </a>
          <a
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground"
            href="#models"
          >
            Models
          </a>
          <a
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground"
            href="#keys"
          >
            Keys
          </a>
          <a
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground"
            href="#usage"
          >
            Usage
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-3">
          <Link
            className="hidden text-sm text-muted hover:text-foreground sm:block"
            href="/"
          >
            Site
          </Link>
          <Link
            className="hidden text-sm text-muted hover:text-foreground sm:block"
            href="/dashboard"
          >
            Console
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
