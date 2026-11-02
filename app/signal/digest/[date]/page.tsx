import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { digestWindow } from "@/lib/content/digest";
import { contentDate } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { listItems } from "@/lib/content/store/items";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ date: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { date } = await params;

  return { title: `Signal digest — ${date}` };
}

export default async function SignalDigestDayPage({ params }: PageProps) {
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

  const { date } = await params;
  const window = digestWindow(date);

  if (!window) notFound();

  const db = await getDatabase();
  const page = await listItems(db, {
    since: window.since,
    until: window.until,
    limit: 48,
  });

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-12 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/signal/digest"
            >
              ← Signal digest
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              {contentDate(`${date}T12:00:00.000Z`)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              {page.total} free piece{page.total === 1 ? "" : "s"} published on
              this UTC day.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          {page.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">No pieces on this day.</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">
                The date is valid, but no ingested item was published inside
                this UTC window.
              </p>
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
