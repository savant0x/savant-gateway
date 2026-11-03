import type { Metadata } from "next";
import type {
  ContentComment,
  ContentReactionSummary,
} from "@/lib/content/types";

import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentSection } from "@/components/content/comment-section";
import { ContentDetailAside } from "@/components/content/content-detail-aside";
import { ContentDisabled } from "@/components/content/content-disabled";
import { ModelModule } from "@/components/content/model-module";
import { ReactionBar } from "@/components/content/reaction-bar";
import { RepoPanel } from "@/components/content/repo-panel";
import { SaveButton } from "@/components/content/save-button";
import { ShareButton } from "@/components/content/share-button";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  contentDate,
  kindPillClass,
  kindLabel,
  tagPillClass,
  videoEmbedUrl,
} from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { ensureArticleBody } from "@/lib/content/reader";
import { ensureGithubRepo } from "@/lib/content/repo-reader";
import { countComments, listComments } from "@/lib/content/store/comments";
import { listLinksForItem } from "@/lib/content/store/links";
import { getItem, listRelatedItems } from "@/lib/content/store/items";
import { isSaved, listReactionSummary } from "@/lib/content/store/engagement";
import { CONTENT_REACTIONS } from "@/lib/content/types";
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

  const reader =
    item.kind === "repo" ? null : await ensureArticleBody(db, item);
  let comments: ContentComment[] = [];
  let commentCount = 0;
  let reactions: ContentReactionSummary[] = CONTENT_REACTIONS.map(
    (reaction) => ({ reaction, count: 0, mine: false }),
  );

  const [repo, links, catalog, related, saved] = await Promise.all([
    ensureGithubRepo(db, item),
    listLinksForItem(db, item.id),
    getCatalogData(),
    listRelatedItems(db, item.id, item.tags, 3),
    customer ? isSaved(db, customer.id, item.id) : Promise.resolve(false),
  ]);

  try {
    [comments, commentCount, reactions] = await Promise.all([
      listComments(db, item.id),
      countComments(db, item.id),
      listReactionSummary(db, item.id, customer?.id ?? null),
    ]);
  } catch {
    // A discussion read must not hide the item or the purchase path.
  }

  const modelsById = new Map(catalog.models.map((model) => [model.id, model]));
  const linkedModels = links
    .map((link) => {
      const model = modelsById.get(link.modelId);

      return model ? { model, reason: link.reason } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const isVideo = item.kind === "video";
  const embedUrl = videoEmbedUrl(item.videoId);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-muted underline-offset-4 hover:border-accent/40 hover:text-foreground dark:border-white/10"
              href={isVideo ? "/signal?kind=video" : "/signal"}
            >
              <span aria-hidden>←</span>
              {isVideo ? "Back to videos" : "Back to Signal"}
            </Link>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${kindPillClass(item.kind)}`}
                  >
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
              <div className="flex flex-wrap items-center gap-2">
                <ShareButton title={item.title} />
                <SaveButton
                  itemId={item.id}
                  saved={saved}
                  signedIn={Boolean(customer)}
                />
              </div>
            </div>

            {item.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <Link
                    key={tag}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:brightness-125 ${tagPillClass(tag)}`}
                    href={`/signal/topics/${encodeURIComponent(tag)}`}
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[80rem] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="min-w-0 space-y-6">
            {embedUrl ? (
              <div className="aspect-video overflow-hidden rounded-xl border border-black/10 bg-black dark:border-white/10">
                <iframe
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={embedUrl}
                  title={item.title}
                />
              </div>
            ) : null}

            {repo ? <RepoPanel repo={repo} /> : null}

            {!isVideo && reader ? (
              <article className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
                {reader.html ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: reader.html }}
                    className="signal-body text-sm leading-7 text-foreground/90"
                  />
                ) : (
                  <p className="text-sm leading-7 text-muted">
                    {item.excerpt ||
                      "This source did not publish a body excerpt."}
                  </p>
                )}

                {reader.error ? (
                  <p
                    className="mt-4 rounded-lg border border-dashed border-black/15 px-3 py-2 text-xs leading-5 text-muted dark:border-white/15"
                    role="status"
                  >
                    {reader.html
                      ? `The full article could not be loaded (${reader.error}). Showing the publisher's feed preview.`
                      : `The full article could not be loaded (${reader.error}). ${item.excerpt ? "Showing the publisher's excerpt." : "The publisher did not syndicate a body."}`}
                  </p>
                ) : null}

                {!reader.error && reader.source === "scrape" ? (
                  <p className="mt-4 text-[11px] text-muted">
                    Body fetched from the publisher&apos;s page and sanitized
                    for on-site reading.
                  </p>
                ) : null}
              </article>
            ) : null}

            <ModelModule models={linkedModels} signedIn={Boolean(customer)} />

            <ReactionBar
              initial={reactions}
              itemId={item.id}
              signedIn={Boolean(customer)}
            />

            <CommentSection
              comments={comments}
              count={commentCount}
              itemId={item.id}
              signedIn={Boolean(customer)}
            />
          </div>

          <ContentDetailAside
            item={repo ? { ...item, github: repo } : item}
            related={related}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
