import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";
import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/config/site";
import { getOverview } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <Dashboard initial={getOverview()} />
      </main>
      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>{siteConfig.name}</span>
          <span>Operator console · local development</span>
        </div>
      </footer>
    </div>
  );
}
