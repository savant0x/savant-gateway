import type { Metadata } from "next";

import Link from "next/link";

import { contentDate } from "@/lib/content/format";
import { listFetchRuns } from "@/lib/content/store/automation";
import { listCycleHistory } from "@/lib/content/store/cycles";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content run history",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  runs?: string;
  run?: string;
  cycles?: string;
  sourceId?: string;
  status?: string;
}>;

function statusTone(status: string): string {
  if (status === "ok") return "text-success";
  if (status === "paused" || status === "partial") return "text-warning";
  if (status === "running") return "text-accent";

  return "text-danger";
}

function hrefFor(
  params: { sourceId?: string; status?: string },
  key: "runs" | "cycles",
  cursor: string,
): string {
  const query = new URLSearchParams();

  if (params.sourceId) query.set("sourceId", params.sourceId);
  if (params.status) query.set("status", params.status);
  query.set(key, cursor);

  return `/admin/content/history?${query.toString()}`;
}

export default async function ContentHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  let error: string | null = null;
  let runs: Awaited<ReturnType<typeof listFetchRuns>> = {
    runs: [],
    nextCursor: null,
  };
  let cycles: Awaited<ReturnType<typeof listCycleHistory>> = {
    cycles: [],
    nextCursor: null,
  };

  try {
    const db = await getDatabase();

    [runs, cycles] = await Promise.all([
      listFetchRuns(db, {
        limit: "25",
        cursor: params.runs ?? params.run ?? null,
      }),
      listCycleHistory(db, {
        limit: "25",
        cursor: params.cycles ?? null,
        sourceId: params.sourceId ?? null,
        status: params.status ?? null,
      }),
    ]);
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
            Content run history
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Every authenticated heartbeat and every per-source cycle is a
            durable receipt. Attempt time is recorded separately from successful
            completion, and a paused source keeps a resumable checkpoint.
          </p>
        </div>
        <Link
          className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          href="/admin/content"
        >
          Back to content
        </Link>
      </div>

      {error ? (
        <section className="rounded-xl border border-danger/30 bg-danger/10 p-5">
          <h2 className="text-sm font-semibold text-danger">
            History is unavailable
          </h2>
          <p className="mt-1 font-mono text-xs text-danger">{error}</p>
        </section>
      ) : (
        <>
          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold">Fetch runs</h2>
              <span className="text-[11px] text-muted">
                Newest first · 25 per page
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Claimed</th>
                  <th>Stored</th>
                  <th>Failed</th>
                  <th>Skipped</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.runs.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={9}>
                      No run has been recorded yet. Configure a scheduler to
                      call the authenticated endpoint.
                    </td>
                  </tr>
                ) : (
                  runs.runs.map((run) => (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap text-xs">
                        {contentDate(run.startedAt)}
                      </td>
                      <td className="text-xs">{run.trigger}</td>
                      <td
                        className={`text-xs font-medium ${statusTone(run.status)}`}
                      >
                        {run.status}
                      </td>
                      <td>{run.sourcesDue}</td>
                      <td>{run.sourcesClaimed}</td>
                      <td>{run.sourcesOk}</td>
                      <td>{run.sourcesFailed}</td>
                      <td>{run.sourcesSkipped}</td>
                      <td className="max-w-[24rem] text-xs text-muted">
                        {run.error ??
                          (run.deadlineReached
                            ? "The run deadline was reached."
                            : "—")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {runs.nextCursor ? (
              <div className="border-t border-black/10 px-4 py-3 dark:border-white/10">
                <Link
                  className="text-xs font-medium text-accent hover:underline"
                  href={hrefFor(params, "runs", runs.nextCursor)}
                >
                  Older runs →
                </Link>
              </div>
            ) : null}
          </section>

          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold">Source cycles</h2>
              <span className="text-[11px] text-muted">
                Newest first · 25 per page
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Source</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Stored</th>
                  <th>Seen</th>
                  <th>Skipped</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {cycles.cycles.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={8}>
                      No source cycle has been recorded yet.
                    </td>
                  </tr>
                ) : (
                  cycles.cycles.map((cycle) => (
                    <tr key={cycle.id}>
                      <td className="whitespace-nowrap text-xs">
                        {contentDate(cycle.startedAt)}
                      </td>
                      <td className="text-xs">{cycle.sourceLabel}</td>
                      <td className="text-xs">{cycle.trigger}</td>
                      <td
                        className={`text-xs font-medium ${statusTone(cycle.status)}`}
                      >
                        {cycle.status}
                        {cycle.budgetStopped ? " · budget" : ""}
                      </td>
                      <td>{cycle.itemsUpserted}</td>
                      <td>{cycle.itemsSeen}</td>
                      <td>{cycle.itemsSkipped}</td>
                      <td className="max-w-[24rem] text-xs text-muted">
                        {cycle.error ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {cycles.nextCursor ? (
              <div className="border-t border-black/10 px-4 py-3 dark:border-white/10">
                <Link
                  className="text-xs font-medium text-accent hover:underline"
                  href={hrefFor(params, "cycles", cycles.nextCursor)}
                >
                  Older cycles →
                </Link>
              </div>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}
