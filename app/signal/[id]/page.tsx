import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { ModelModule } from "@/components/content/model-module";
import { SaveButton } from "@/components/content/save-button";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { contentDate, kindLabel } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { listLinksForItem } from "@/lib/content/store/links";
import { getItem, listRelatedItems } from "@/lib/content/store/items";
import { isSaved } from "@/lib/content/store/engagement";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCatalogData } from "@/lib/store";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  if (!contentEnabled()) return { title: "Signal is not enabled" };

  try {
    const db = await getDatabase();
    const item = await getItem(db, (await params).id);

    return item
      ? {
          title: `${item.title} — Signal`,
          description: item.excerpt.slice(0, 180),
        }
      : { title: "Story not found" };
  } catch {
    return { title: "Signal" };
  }
}

export default async function SignalDetailPage({ params }: PageProps) {
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

  const id = (await params).id;
  const customer = await getCustomerSession();
  const db = await getDatabase();
  const item = await getItem(db, id);

  if (!item) notFound();

  const [links, catalog, related, saved] = await Promise.all([
    listLinksForItem(db, item.id),
    getCatalogData(),
    listRelatedItems(db, item.id, item.tags, 3),
    customer ? isSaved(db, customer.id, item.id) : Promise.resolve(false),
  ]);

  const modelsById = new Map(catalog.models.map((model) => [model.id, model]));
  const linkedModels = links
    .map((link) => {
      const model = modelsById.get(link.modelId);

      return model ? { model, reason: link.reason } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/signal"
            >
              ← Signal
            </Link>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-cyan-200">
                    {kindLabel(item.kind)}
                  </span>
                  <span>{item.sourceLabel}</span>
                  <span aria-hidden>·</span>
                  <span>{contentDate(item.publishedAt)}</span>
                  {item.author ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{item.author}</span>
                    </>
                  ) : null}
                </div>
                <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  {item.title}
                </h1>
              </div>
              <SaveButton
                itemId={item.id}
                saved={saved}
                signedIn={Boolean(customer)}
              />
            </div>

            {item.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <Link
                    key={tag}
                    className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-foreground dark:border-white/10"
                    href={`/signal/topics/${encodeURIComponent(tag)}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[80rem] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="min-w-0 space-y-6">
            {item.videoId ? (
              <div className="aspect-video overflow-hidden rounded-xl border border-black/10 bg-black dark:border-white/10">
                <iframe
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                    item.videoId,
                  )}`}
                  title={item.title}
                />
              </div>
            ) : null}

            <article className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              {item.bodyHtml ? (
                <div
                  dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                  className="signal-body text-sm leading-7 text-foreground/90"
                />
              ) : (
                <p className="text-sm leading-7 text-muted">
                  {item.excerpt ||
                    "This source did not publish a body excerpt."}
                </p>
              )}

              <div className="mt-6 border-t border-black/10 pt-4 text-xs text-muted dark:border-white/10">
                <a
                  className="text-accent underline-offset-4 hover:underline"
                  href={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Read the original at {item.sourceLabel} ↗
                </a>
                <p className="mt-2">
                  This is free third-party content. Savant Gateway does not sell
                  it and is not responsible for its claims.
                </p>
              </div>
            </article>

            <ModelModule models={linkedModels} signedIn={Boolean(customer)} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-surface p-5 text-xs leading-5 text-muted dark:border-white/10">
              <p className="text-sm font-semibold text-foreground">
                Why this is here
              </p>
              <p className="mt-2">
                Items are ingested from operator-selected RSS and YouTube
                sources. A model link appears only when the title or an exact
                publisher tag names the model; the reason is shown above.
              </p>
              <Link
                className="mt-3 inline-block text-accent underline-offset-4 hover:underline"
                href="/signal/briefing"
              >
                Build a model briefing
              </Link>
            </div>

            {related.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Related reading</h2>
                {related.map((entry) => (
                  <ContentCard key={entry.id} compact item={entry} />
                ))}
              </div>
            ) : null}
          </aside>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
