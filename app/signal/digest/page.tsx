import type { Metadata } from "next";

import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { digestDay, recentDigestDays } from "@/lib/content/digest";
import { contentDate } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { cachedPublicRead } from "@/lib/content/public-cache";
import { listItems } from "@/lib/content/store/items";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signal digest — the last seven days",
  description:
    "A UTC-day digest of free AI articles, videos, papers, repositories, and discussions from Signal.",
  alternates: {
    types: { "application/rss+xml": "/signal/digest/feed.xml" },
  },
};

export default async function SignalDigestPage() {
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

  const days = recentDigestDays(7);
  const db = await getDatabase();
  const page = await cachedPublicRead("signal:digest:7:48", () =>
    listItems(db, {
      since: `${days[days.length - 1]}T00:00:00.000Z`,
      until: `${days[0]}T23:59:59.999Z`,
      limit: 48,
    }),
  );
  const groups = new Map<string, typeof page.items>();

  for (const item of page.items) {
    const day = digestDay(item.publishedAt);

    if (!day) continue;

    const group = groups.get(day) ?? [];

    group.push(item);
    groups.set(day, group);
  }

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
              The digest
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              The last seven UTC days of free coverage. Each item links to the
              models it names, so reading leads to a model page, not a dead end.
            </p>
            <a
              className="mt-3 inline-block text-xs font-medium text-accent underline-offset-4 hover:underline"
              href="/signal/digest/feed.xml"
            >
              Subscribe by RSS
            </a>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          {groups.size === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">No recent pieces.</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">
                The digest is built from items already in Signal. Fetch a source
                in Admin → Content to populate it.
              </p>
            </div>
          ) : (
            days.map((day) => {
              const items = groups.get(day) ?? [];

              if (items.length === 0) return null;

              return (
                <section key={day}>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      {contentDate(`${day}T12:00:00.000Z`)}
                    </h2>
                    <Link
                      className="text-xs text-accent hover:underline"
                      href={`/signal/digest/${day}`}
                    >
                      {items.length} piece{items.length === 1 ? "" : "s"} →
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.slice(0, 6).map((item) => (
                      <ContentCard key={item.id} compact item={item} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
