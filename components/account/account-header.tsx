import type { Customer } from "@/lib/types";

import Image from "next/image";
import Link from "next/link";

import { LogoutButton } from "./logout-button";

import { siteConfig } from "@/config/site";

export function AccountHeader({ customer }: { customer: Customer }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050b12]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <Image
            alt=""
            className="h-9 w-9 rounded-xl ring-1 ring-cyan-300/30"
            height={36}
            src="/logo-32.png"
            width={36}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {siteConfig.name}
            </span>
            <span className="hidden text-[11px] text-muted sm:block">
              Customer account
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <Link
            className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            href="/models"
          >
            Models
          </Link>
          <Link
            className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            href="/#quickstart"
          >
            Quick start
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-3">
          <div className="hidden text-right sm:block">
            <p className="max-w-[16rem] truncate text-sm font-medium">
              {customer.name}
            </p>
            <p className="max-w-[16rem] truncate text-[11px] text-muted">
              {customer.email}
            </p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
