import Link from "next/link";

import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./logout-button";

import { BrandMark } from "@/components/brand-mark";

export function AdminHeader() {
  return (
    <header className="site-chrome">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <BrandMark />
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="hidden font-mono text-[10px] text-accent sm:block">
              CONTROL PLANE
            </span>
            <Link aria-label="Operator console" href="/dashboard">
              <i aria-hidden className="fa-solid fa-terminal" />
              <span className="ml-2 hidden sm:inline">Console</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
        <AdminNav />
      </div>
    </header>
  );
}
