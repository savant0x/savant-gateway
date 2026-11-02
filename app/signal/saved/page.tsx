import type { Metadata } from "next";

import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { contentEnabled } from "@/lib/content/policy";
import { listSavedItems } from "@/lib/content/store/engagement";
import { requireCustomerPage } from "@/lib/customer-auth";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved reading — Signal",
  robots: { index: false, follow: false },
};

export default async function SignalSavedPage() {
  if (!contentEnabled()) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main>
          <ContentDisabled />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const customer = await requireCustomerPage();
  const db = await getDatabase();
  const page = await listSavedItems(db, customer.id);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-12 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/signal"
            >
              ← Signal
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              Saved reading
            </h1>
            <p className="mt-2 text-sm text-muted">
              {page.total} saved {page.total === 1 ? "piece" : "pieces"} for{" "}
              {customer.name}.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          {page.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">Nothing saved yet.</p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Open a Signal piece and press Save for later. Saved items stay
                with your account.
              </p>
              <Link
                className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
                href="/signal"
              >
                Browse Signal
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.items.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
