import type { Metadata } from "next";
import type { ContentKind } from "@/lib/content/types";

import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { kindLabel, tagPillClass } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { listItems, listTags } from "@/lib/content/store/items";
import { CONTENT_KINDS } from "@/lib/content/types";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signal — AI news, videos, papers, and discussions",
  description:
    "Free AI discovery from selected RSS and YouTube sources, linked to the models it discusses and the gateway's live prices.",
};

type Search = {
  kind?: string;
  tag?: string;
  q?: string;
  page?: string;
};

function queryHref(
  kind: string | undefined,
  tag: string | undefined,
  page = 1,
  search?: string,
) {
  const params = new URLSearchParams();

  if (kind) params.set("kind", kind);
  if (tag) params.set("tag", tag);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();

  return query ? `/signal?${query}` : "/signal";
}

export default async function SignalPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
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

  const params = await searchParams;
  const kind = CONTENT_KINDS.includes(params.kind as ContentKind)
    ? (params.kind as ContentKind)
    : undefined;
  const tag = params.tag?.trim() || undefined;
  const search = params.q?.trim().slice(0, 120) || undefined;
  const page = Math.max(1, Math.min(200, Number(params.page) || 1));
  const pageSize = 24;

  let pageData: Awaited<ReturnType<typeof listItems>> = {
    items: [],
    total: 0,
  };
  let tags: Awaited<ReturnType<typeof listTags>> = [];
  let error: string | null = null;

  try {
    const db = await getDatabase();

    [pageData, tags] = await Promise.all([
      listItems(db, {
        kind,
        tag,
        search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      listTags(db, 24),
    ]);
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Storage is unavailable.";
  }

  const pageCount = Math.max(1, Math.ceil(pageData.total / pageSize));
  const filters = [
    { key: undefined, label: "All" },
    ...CONTENT_KINDS.map((entry) => ({ key: entry, label: kindLabel(entry) })),
  ];

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-14 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Signal
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                  Follow the models, not the feed.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                  Free articles, videos, papers, repositories, and discussions
                  from selected sources. Each piece links to the models it
                  names, with the gateway&apos;s live prices and one purchase
                  path.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-surface/70 px-4 py-3 text-xs text-muted">
                <p className="text-2xl font-semibold text-foreground">
                  {pageData.total}
                </p>
                <p>published pieces</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          <form
            action="/signal"
            className="mb-4 flex flex-wrap items-center gap-2"
            method="get"
          >
            {kind ? <input name="kind" type="hidden" value={kind} /> : null}
            {tag ? <input name="tag" type="hidden" value={tag} /> : null}
            <label className="sr-only" htmlFor="signal-search">
              Search Signal
            </label>
            <input
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10"
              defaultValue={search}
              id="signal-search"
              maxLength={120}
              name="q"
              placeholder="Search titles and excerpts"
              type="search"
            />
            <button
              className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
              type="submit"
            >
              Search
            </button>
            {search ? (
              <Link
                className="text-xs text-muted hover:text-foreground"
                href={queryHref(kind, tag)}
              >
                Clear
              </Link>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Content kinds" className="flex flex-wrap gap-1.5">
              {filters.map((filter) => {
                const active = filter.key === kind;

                return (
                  <Link
                    key={filter.label}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                        : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
                    }`}
                    href={queryHref(filter.key, tag, 1, search)}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="text-xs text-accent hover:underline"
                href="/signal/digest"
              >
                Today&apos;s digest →
              </Link>
              <Link
                className="text-xs text-accent hover:underline"
                href="/signal/briefing"
              >
                Your briefing →
              </Link>
            </div>
          </div>

          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                Topics
              </span>
              {tags.slice(0, 12).map((entry) => {
                const active = entry.slug === tag;

                return (
                  <Link
                    key={entry.slug}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-[filter,box-shadow] hover:brightness-125 ${tagPillClass(entry.slug)} ${active ? "ring-1 ring-cyan-200/70" : ""}`}
                    href={queryHref(kind, entry.slug, 1, search)}
                  >
                    #{entry.slug} · {entry.count}
                  </Link>
                );
              })}
              {tag && !tags.slice(0, 12).some((entry) => entry.slug === tag) ? (
                <Link
                  aria-current="page"
                  className={`rounded-full border px-2 py-0.5 text-[11px] ring-1 ring-cyan-200/70 ${tagPillClass(tag)}`}
                  href={queryHref(kind, tag, 1, search)}
                >
                  #{tag}
                </Link>
              ) : null}
              {tag ? (
                <Link
                  className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-muted hover:text-foreground dark:border-white/10"
                  href={queryHref(kind, undefined, 1, search)}
                >
                  Clear topic ×
                </Link>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mt-8 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              Content storage is unavailable: {error}
            </p>
          ) : pageData.items.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">
                {search ? `No pieces match “${search}”.` : "No stories yet."}
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">
                {search
                  ? "Search looks at the title and excerpt only. Try a shorter term, or clear the search to browse everything."
                  : "The hub is enabled, but no source has produced an item. An operator can add a source in Admin → Content and press Fetch."}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageData.items.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {pageCount > 1 ? (
            <nav
              aria-label="Signal pagination"
              className="mt-8 flex items-center justify-between gap-3 text-xs"
            >
              <Link
                aria-disabled={page <= 1}
                className={
                  page <= 1
                    ? "pointer-events-none text-muted/40"
                    : "text-accent hover:underline"
                }
                href={queryHref(kind, tag, Math.max(1, page - 1), search)}
              >
                ← Newer
              </Link>
              <span className="text-muted">
                Page {page} of {pageCount}
              </span>
              <Link
                aria-disabled={page >= pageCount}
                className={
                  page >= pageCount
                    ? "pointer-events-none text-muted/40"
                    : "text-accent hover:underline"
                }
                href={queryHref(
                  kind,
                  tag,
                  Math.min(pageCount, page + 1),
                  search,
                )}
              >
                Older →
              </Link>
            </nav>
          ) : null}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
