import type { ContentItem } from "@/lib/content/types";

import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { contentDate, formatCount } from "@/lib/content/format";
import { isHackerNewsDiscussionUrl } from "@/lib/content/hackernews";

function describeComments(item: ContentItem): string {
  if (item.kind === "video") return "Comments on YouTube";
  if (isHackerNewsDiscussionUrl(item.url)) return "Hacker News comments";

  return "Comments";
}

/**
 * The watch-page details column (FID-2026-1102-092).
 *
 * A fact is rendered only when the source actually reported it. A missing
 * view/like count is an absence, not a zero, and is not displayed as one.
 */
export function ContentDetailAside({
  item,
  related,
}: {
  item: ContentItem;
  related: ContentItem[];
}) {
  const metrics = item.metrics;
  const isVideo = item.kind === "video";
  const isRepo = item.kind === "repo";
  const discussionUrl = isHackerNewsDiscussionUrl(item.url) ? item.url : null;
  const publisherUrl =
    item.externalUrl && item.externalUrl !== item.url ? item.externalUrl : null;
  const primaryUrl = publisherUrl ?? item.url;
  const primaryLabel = isVideo
    ? "Watch on YouTube"
    : publisherUrl
      ? "Read the publisher"
      : "Read the original";
  const facts: Array<{ label: string; value: string }> = [
    { label: "Source", value: item.sourceLabel },
  ];

  if (item.author) {
    facts.push({ label: isVideo ? "Channel" : "Author", value: item.author });
  }

  facts.push({ label: "Published", value: contentDate(item.publishedAt) });

  if (metrics.views > 0) {
    facts.push({
      label: isRepo ? "Trendshift views" : "Views",
      value: formatCount(metrics.views),
    });
  }

  if (metrics.likes > 0) {
    facts.push({
      label: isRepo ? "Bookmarks" : "Likes",
      value: formatCount(metrics.likes),
    });
  }

  if (item.github) {
    facts.push({
      label: "GitHub stars",
      value: formatCount(item.github.stars),
    });
    facts.push({ label: "Forks", value: formatCount(item.github.forks) });
  }

  if (metrics.rating !== null) {
    facts.push({ label: "Rating", value: `${metrics.rating.toFixed(1)} / 5` });
  }

  if (metrics.comments > 0) {
    facts.push({
      label: describeComments(item),
      value: formatCount(metrics.comments),
    });
  }

  return (
    <aside className="space-y-4">
      {isVideo ? (
        <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
          <h2 className="text-sm font-semibold">Description</h2>
          {item.bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
              className="signal-body mt-2 max-h-[24rem] overflow-y-auto pr-1 text-xs leading-6 text-muted"
            />
          ) : (
            <p className="mt-2 whitespace-pre-line text-xs leading-6 text-muted">
              {item.excerpt || "This video did not publish a description."}
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
        <h2 className="text-sm font-semibold">
          {isVideo ? "Video details" : "Story details"}
        </h2>
        <dl className="mt-3 divide-y divide-black/10 text-xs dark:divide-white/10">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <dt className="text-muted">{fact.label}</dt>
              <dd className="text-right font-medium text-foreground">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        {discussionUrl ? (
          <a
            className="mt-3 block text-xs text-accent underline-offset-4 hover:underline"
            href={discussionUrl}
            rel="noreferrer"
            target="_blank"
          >
            Discuss on Hacker News ↗
          </a>
        ) : null}
        {discussionUrl && !publisherUrl ? null : (
          <a
            className="mt-3 block text-xs text-accent underline-offset-4 hover:underline"
            href={primaryUrl}
            rel="noreferrer"
            target="_blank"
          >
            {primaryLabel} ↗
          </a>
        )}
        <p className="mt-2 text-[11px] leading-5 text-muted">
          This is free third-party content. Savant Gateway does not sell it and
          is not responsible for its claims.
        </p>
      </div>

      <div className="rounded-xl border border-black/10 bg-surface p-5 text-xs leading-5 text-muted dark:border-white/10">
        <p className="text-sm font-semibold text-foreground">
          Why this is here
        </p>
        <p className="mt-2">
          Items are ingested from operator-selected RSS, Reddit, YouTube,
          HuggingFace, Trendshift, and Hacker News sources. Hacker News threads
          are filtered locally by topic and keep their publisher link when one
          exists. Views, likes, comment counts and the star rating come from the
          source when it reports them; the YouTube Data API fills in likes and
          comments when a key is configured. A missing count is not shown as
          zero. A model link appears only when the title or an exact publisher
          tag names the model.
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
  );
}
