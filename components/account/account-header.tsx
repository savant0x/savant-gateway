import type { Customer } from "@/lib/types";

import Link from "next/link";

import { LogoutButton } from "./logout-button";

import { BrandMark } from "@/components/brand-mark";

export function AccountHeader({ customer }: { customer: Customer }) {
  return (
    <header className="site-chrome">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <BrandMark />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:block">
              {customer.name}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav
          aria-label="Account navigation"
          className="flex gap-6 border-t border-border py-3 font-mono text-[11px] text-muted"
        >
          <Link className="text-accent" href="/account">
            Account
          </Link>
          <Link href="/models">Models &amp; pricing</Link>
          <Link href="/docs">API reference</Link>
        </nav>
      </div>
    </header>
  );
}
