import Image from "next/image";
import Link from "next/link";

import { AdminNav } from "./admin-nav";
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

        <div className="ml-auto">
          <AdminNav />
        </div>

        <div className="flex items-center gap-2 md:ml-3">
          <Link
            className="hidden items-center gap-1.5 text-sm text-muted hover:text-foreground sm:flex"
            href="/"
          >
            <i aria-hidden className="fa-solid fa-globe text-xs" />
            Site
          </Link>
          <Link
            className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
            href="/dashboard"
          >
            <i aria-hidden className="fa-solid fa-terminal text-xs" />
            Console
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
