import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { contentEnabled } from "@/lib/content/policy";
import { listItems } from "@/lib/content/store/items";
import { normalizeTag, tagLabel } from "@/lib/content/taxonomy";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tag: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const tag = normalizeTag((await params).tag);

  return tag
    ? { title: `${tagLabel(tag)} — Signal topics` }
    : { title: "Topic — Signal" };
}

export default async function SignalTopicPage({ params }: PageProps) {
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

  const tag = normalizeTag((await params).tag);

  if (!tag) notFound();

  const db = await getDatabase();
  const page = await listItems(db, { tag, limit: 48 });

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
              {tagLabel(tag)}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {page.total} {page.total === 1 ? "piece" : "pieces"} with this
              canonical tag.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          {page.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">
                No pieces under this tag yet.
              </p>
              <p className="mt-2 text-xs text-muted">
                Publisher tags are normalized at ingest; a later fetch may add
                one.
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
