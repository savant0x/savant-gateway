import { AdminHeader } from "@/components/admin/admin-header";
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
    <div className="workspace min-h-screen bg-background text-foreground">
      <AdminHeader />

      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>{siteConfig.name}</span>
          <span>
            Admin · session required · financial data is served no-store
          </span>
        </div>
      </footer>
    </div>
  );
}
