import type { Metadata } from "next";

import Link from "next/link";

import { ContentLinkActions } from "@/components/admin/content-link-actions";
import { ContentLinkForm } from "@/components/admin/content-link-form";
import { ContentSourceActions } from "@/components/admin/content-source-actions";
import { ContentSourceForm } from "@/components/admin/content-source-form";
import { ContentSourcePresets } from "@/components/admin/content-source-presets";
import { contentDate } from "@/lib/content/format";
import { listRecentCycles, contentStats } from "@/lib/content/store/cycles";
import { listItems, listLinkableModels } from "@/lib/content/store/items";
import { listRecentLinks } from "@/lib/content/store/links";
import { listSources } from "@/lib/content/store/sources";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin content",
  robots: { index: false, follow: false },
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-black/10 bg-surface px-4 py-3 dark:border-white/10">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default async function AdminContentPage() {
  let error: string | null = null;
  let sources: Awaited<ReturnType<typeof listSources>> = [];
  let stats: Awaited<ReturnType<typeof contentStats>> | null = null;
  let cycles: Awaited<ReturnType<typeof listRecentCycles>> = [];
  let links: Awaited<ReturnType<typeof listRecentLinks>> = [];
  let recentItems: Awaited<ReturnType<typeof listItems>>["items"] = [];
  let models: Awaited<ReturnType<typeof listLinkableModels>> = [];

  try {
    const db = await getDatabase();

    [sources, stats, cycles, links, recentItems, models] = await Promise.all([
      listSources(db),
      contentStats(db),
      listRecentCycles(db, 8),
      listRecentLinks(db, 15),
      listItems(db, { limit: 20 }),
      listLinkableModels(db),
    ]).then(
      ([sourceRows, statsRow, cycleRows, linkRows, itemPage, modelRows]) => [
        sourceRows,
        statsRow,
        cycleRows,
        linkRows,
        itemPage.items,
        modelRows,
      ],
    );
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Storage is unavailable.";
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Signal
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Content sources
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            RSS, YouTube, HuggingFace Daily Papers, and Trendshift sources
            become public Signal items. Ingestion is bounded to 15 seconds, 2
            MiB, and the per-source item cap; five consecutive failures disable
            a source. Model links are automatic only on an exact title or tag
            alias, and an operator can override or dismiss them.
          </p>
        </div>
        <Link
          className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          href="/signal"
        >
          Open public Signal
        </Link>
      </div>

      {error ? (
        <CardError message={error} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Sources" value={stats?.sources ?? 0} />
            <Stat label="Enabled" value={stats?.enabledSources ?? 0} />
            <Stat label="Items" value={stats?.items ?? 0} />
            <Stat label="Linked items" value={stats?.linkedItems ?? 0} />
            <Stat
              label="Last fetch"
              value={
                stats?.lastFetchedAt
                  ? contentDate(stats.lastFetchedAt)
                  : "Never"
              }
            />
          </div>

          <ContentSourcePresets />

          <ContentSourceForm />

          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>Tags</th>
                  <th>Status</th>
                  <th>Last fetch</th>
                  <th>Failures</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={7}>
                      No sources yet. Add a feed above, then press Fetch.
                    </td>
                  </tr>
                ) : (
                  sources.map((source) => (
                    <tr key={source.id}>
                      <td>
                        <p className="font-medium">{source.label}</p>
                        <p className="mono max-w-[28rem] truncate text-[11px] text-muted">
                          {source.url}
                        </p>
                      </td>
                      <td>{source.kind}</td>
                      <td className="text-xs text-muted">
                        {source.config.tags.length > 0
                          ? source.config.tags.join(", ")
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            source.enabled
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {source.enabled ? source.status : "disabled"}
                        </span>
                        {source.lastError ? (
                          <p className="mt-1 max-w-[20rem] text-[11px] text-danger">
                            {source.lastError}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-xs">
                        {source.lastFetchedAt
                          ? contentDate(source.lastFetchedAt)
                          : "Never"}
                      </td>
                      <td>{source.failureStreak}</td>
                      <td>
                        <ContentSourceActions
                          enabled={source.enabled}
                          id={source.id}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <h2 className="text-sm font-semibold">Recent fetch cycles</h2>
              <p className="mt-1 text-xs text-muted">
                A cycle is written before the request and closed with counts, so
                a failed fetch is visible rather than silent.
              </p>
              <div className="mt-4 space-y-2">
                {cycles.length === 0 ? (
                  <p className="text-xs text-muted">No fetch has run yet.</p>
                ) : (
                  cycles.map((cycle) => (
                    <div
                      key={cycle.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/[0.02] px-3 py-2 text-xs dark:bg-white/[0.03]"
                    >
                      <span>
                        {cycle.sourceLabel} ·{" "}
                        <span
                          className={
                            cycle.status === "ok"
                              ? "text-success"
                              : "text-danger"
                          }
                        >
                          {cycle.status}
                        </span>
                      </span>
                      <span className="text-muted">
                        {cycle.itemsUpserted}/{cycle.itemsSeen} ·{" "}
                        {contentDate(cycle.startedAt)}
                      </span>
                      {cycle.error ? (
                        <span className="basis-full text-danger">
                          {cycle.error}
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <h2 className="text-sm font-semibold">Model link override</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                A manual link is permanent across re-fetches. Dismiss an
                automatic link when the alias match is wrong; the next fetch may
                recreate it unless the model alias is corrected upstream.
              </p>
              <div className="mt-4">
                <ContentLinkForm
                  items={recentItems.map((item) => ({
                    id: item.id,
                    title: item.title,
                  }))}
                  models={models.map((model) => ({
                    id: model.id,
                    name: model.name,
                  }))}
                />
              </div>
            </section>
          </div>

          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Model</th>
                  <th>Relation</th>
                  <th>Source</th>
                  <th>Confidence</th>
                  <th>Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={7}>
                      No model links yet. Fetch a source whose title or tag
                      contains a catalog model alias.
                    </td>
                  </tr>
                ) : (
                  links.map((link) => (
                    <tr key={`${link.itemId}:${link.modelId}`}>
                      <td className="max-w-[22rem] truncate">
                        {link.itemTitle}
                      </td>
                      <td className="mono text-xs">{link.modelId}</td>
                      <td>{link.relation}</td>
                      <td>{link.relationSource}</td>
                      <td>{Math.round(link.confidence * 100)}%</td>
                      <td className="max-w-[20rem] text-xs text-muted">
                        {link.reason}
                      </td>
                      <td>
                        <ContentLinkActions
                          itemId={link.itemId}
                          modelId={link.modelId}
                          relationSource={link.relationSource}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function CardError({ message }: { message: string }) {
  return (
    <section className="rounded-xl border border-danger/30 bg-danger/10 p-5">
      <h2 className="text-sm font-semibold text-danger">
        Content storage is not configured
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        The content namespace lives in the same PostgreSQL database as the
        catalog. No source can be fetched until the handle opens.
      </p>
      <p className="mt-3 font-mono text-xs text-danger">{message}</p>
    </section>
  );
}
