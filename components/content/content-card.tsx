import type { ContentItem } from "@/lib/content/types";

import Link from "next/link";

import { ContentMedia } from "@/components/content/content-media";
import { contentDate, kindLabel, shortExcerpt } from "@/lib/content/format";

const KIND_STYLES: Record<ContentItem["kind"], string> = {
  article: "bg-cyan-300/10 text-cyan-200",
  video: "bg-rose-300/10 text-rose-200",
  paper: "bg-violet-300/10 text-violet-200",
  repo: "bg-emerald-300/10 text-emerald-200",
  discussion: "bg-amber-300/10 text-amber-200",
};

export function ContentCard({
  item,
  compact = false,
}: {
  item: ContentItem;
  compact?: boolean;
}) {
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-surface transition-colors hover:border-accent/40 dark:border-white/10">
      {!compact && (item.thumbnailUrl || item.videoId) ? (
        <ContentMedia
          itemId={item.id}
          thumbnailUrl={item.thumbnailUrl}
          title={item.title}
          videoId={item.videoId}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${KIND_STYLES[item.kind]}`}
          >
            {kindLabel(item.kind)}
          </span>
          <span className="text-muted">{item.sourceLabel}</span>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <span className="text-muted">{contentDate(item.publishedAt)}</span>
        </div>

        <h3 className="mt-3 line-clamp-3 text-base font-semibold leading-6">
          <Link href={`/signal/${item.id}`}>{item.title}</Link>
        </h3>

        {!compact && item.excerpt ? (
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">
            {shortExcerpt(item.excerpt, 180)}
          </p>
        ) : null}

        {item.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-muted hover:border-accent/40 hover:text-foreground dark:border-white/10"
                href={`/signal/topics/${encodeURIComponent(tag)}`}
              >
                {tag}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          <Link
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            href={`/signal/${item.id}`}
          >
            {item.videoId ? "Watch and see models" : "Read and see models"} →
          </Link>
        </div>
      </div>
    </article>
  );
}
