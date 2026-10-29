import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/admin/logout-button";
import { BrandMark } from "@/components/brand-mark";
import { siteConfig } from "@/config/site";
import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="workspace admin-shell min-h-screen bg-background text-foreground">
      <aside className="admin-rail">
        <div className="admin-rail-brand">
          <BrandMark />
          <span className="admin-rail-label">Control plane</span>
        </div>

        <AdminNav />

        <div className="admin-rail-footer">
          <Link
            aria-label="Operator console"
            className="admin-rail-link"
            href="/dashboard"
          >
            <i aria-hidden className="fa-solid fa-terminal" />
            <span className="hidden sm:inline">Console</span>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="admin-main">
        <main className="mx-auto w-full max-w-[90rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-black/10 dark:border-white/10">
          <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
            <span>{siteConfig.name}</span>
            <span>
              Admin · session required · financial data is served no-store
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
