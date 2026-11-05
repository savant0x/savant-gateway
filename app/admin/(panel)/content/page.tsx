import type { Metadata } from "next";

import Link from "next/link";

import { ContentAutomationPanel } from "@/components/admin/content-automation-panel";
import { ContentCommentModeration } from "@/components/admin/content-comment-moderation";
import { ContentLinkActions } from "@/components/admin/content-link-actions";
import { ContentLinkForm } from "@/components/admin/content-link-form";
import { ContentSourceFetchAll } from "@/components/admin/content-source-fetch-all";
import { ContentSourceForm } from "@/components/admin/content-source-form";
import { ContentSourcePresets } from "@/components/admin/content-source-presets";
import { ContentSourceTable } from "@/components/admin/content-source-table";
import { automationHealth } from "@/lib/content/automation";
import { contentDate } from "@/lib/content/format";
import { contentCronSecret } from "@/lib/content/policy";
import { automationSnapshot } from "@/lib/content/store/automation";
import { listRecentCommentsForOperator } from "@/lib/content/store/comments";
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
  let recentComments: Awaited<
    ReturnType<typeof listRecentCommentsForOperator>
  > = [];
  let snapshot: Awaited<ReturnType<typeof automationSnapshot>> | null = null;

  try {
    const db = await getDatabase();

    [sources, stats, cycles, links, recentItems, models, recentComments] =
      await Promise.all([
        listSources(db),
        contentStats(db),
        listRecentCycles(db, 8),
        listRecentLinks(db, 15),
        listItems(db, { limit: 20 }),
        listLinkableModels(db),
        listRecentCommentsForOperator(db, 12),
      ]).then(
        ([
          sourceRows,
          statsRow,
          cycleRows,
          linkRows,
          itemPage,
          modelRows,
          commentRows,
        ]) => [
          sourceRows,
          statsRow,
          cycleRows,
          linkRows,
          itemPage.items,
          modelRows,
          commentRows,
        ],
      );
    snapshot = await automationSnapshot(db);
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Storage is unavailable.";
  }

  const health = snapshot
    ? automationHealth(
        snapshot.policy,
        snapshot.lastRun,
        Boolean(contentCronSecret()),
        snapshot.dueCount,
      )
    : null;

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
            RSS, Reddit, YouTube, HuggingFace Daily Papers, Trendshift, and
            Hacker News sources become public Signal items. Each source has a
            15-second transport bound, 2 MiB response cap, and per-source item
            cap; each heartbeat has a 35-second work budget. Five consecutive
            fetch failures disable a source, while a configuration mistake stays
            visible without disabling it. Hacker News is filtered to AI/agent
            stories locally. Model links are automatic only on an exact title or
            tag alias, and an operator can override or dismiss them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            href="/admin/content/history"
          >
            Run history
          </Link>
          <Link
            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            href="/signal"
          >
            Open public Signal
          </Link>
        </div>
      </div>

      {error ? (
        <CardError message={error} />
      ) : (
        <>
          {snapshot && health ? (
            <ContentAutomationPanel
              dueCount={snapshot.dueCount}
              health={health}
              lastRun={snapshot.lastRun}
              lastSuccessAt={snapshot.lastSuccessAt}
              policy={snapshot.policy}
              policyError={snapshot.policyError}
              secretConfigured={Boolean(contentCronSecret())}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sources" value={stats?.sources ?? 0} />
            <Stat label="Enabled" value={stats?.enabledSources ?? 0} />
            <Stat label="Items" value={stats?.items ?? 0} />
            <Stat label="Linked items" value={stats?.linkedItems ?? 0} />
            <Stat label="Comments" value={stats?.comments ?? 0} />
            <Stat label="Reactions" value={stats?.reactions ?? 0} />
            <Stat label="Saved items" value={stats?.savedItems ?? 0} />
            <Stat
              label="Last success"
              value={
                stats?.lastSuccessAt
                  ? contentDate(stats.lastSuccessAt)
                  : "Never"
              }
            />
            <Stat
              label="Last attempt"
              value={
                stats?.lastFetchedAt
                  ? contentDate(stats.lastFetchedAt)
                  : "Never"
              }
            />
          </div>

          <ContentSourcePresets />

          <ContentSourceForm />

          <ContentSourceFetchAll sources={sources} />

          <ContentSourceTable sources={sources} />

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Recent fetch cycles</h2>
                <Link
                  className="text-[11px] font-medium text-accent hover:underline"
                  href="/admin/content/history"
                >
                  All history →
                </Link>
              </div>
              <p className="mt-1 text-xs text-muted">
                A cycle is written before the request and closed with counts, so
                a failed fetch is visible rather than silent. Attempt and
                success clocks are recorded separately.
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
                        {cycle.itemsUpserted}/{cycle.itemsSeen}
                        {cycle.itemsSkipped > 0
                          ? ` · ${cycle.itemsSkipped} skipped`
                          : ""}{" "}
                        · {contentDate(cycle.startedAt)}
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
                A manual link is permanent across re-fetches. Accept pins an
                automatic suggestion as a durable operator decision. Dismissal
                is durable too: a later fetch cannot recreate the pair. Restore
                is the only route back to a suggested or accepted state.
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

          <ContentCommentModeration comments={recentComments} />

          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Model</th>
                  <th>Relation</th>
                  <th>Source</th>
                  <th>State</th>
                  <th>Confidence</th>
                  <th>Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={8}>
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
                      <td className="mono text-xs">{link.state}</td>
                      <td>{Math.round(link.confidence * 100)}%</td>
                      <td className="max-w-[20rem] text-xs text-muted">
                        {link.reason}
                      </td>
                      <td>
                        <ContentLinkActions
                          itemId={link.itemId}
                          modelId={link.modelId}
                          revision={link.revision}
                          state={link.state}
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
