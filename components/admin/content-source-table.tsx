"use client";

import type { ContentSource } from "@/lib/content/types";

import { Fragment, useState } from "react";

import { ContentSourceActions } from "./content-source-actions";
import { ContentSourceForm } from "./content-source-form";

import { contentDate } from "@/lib/content/format";
import { sourceGuidance } from "@/lib/content/source-guidance";

function SourceStatusCell({ source }: { source: ContentSource }) {
  const guidance = sourceGuidance(source);

  return (
    <>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] ${
          source.enabled
            ? "bg-success/10 text-success"
            : "bg-danger/10 text-danger"
        }`}
      >
        {source.enabled ? source.status : "disabled"}
      </span>
      <p className="mt-1 max-w-[24rem] text-[11px] text-muted">
        {guidance.hint}
      </p>
      <p className="mt-1 max-w-[24rem] text-[11px] text-foreground">
        {guidance.action}
      </p>
      {source.lastError ? (
        <details className="mt-1 max-w-[24rem] text-[11px]">
          <summary className="cursor-pointer text-muted">
            Last error detail
          </summary>
          <p className="mt-1 break-words text-danger">{source.lastError}</p>
        </details>
      ) : null}
    </>
  );
}

export function ContentSourceTable({ sources }: { sources: ContentSource[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
      <table className="data-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Kind</th>
            <th>Tags</th>
            <th>Status</th>
            <th>Fetch clocks</th>
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
              <Fragment key={source.id}>
                <tr>
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
                    <SourceStatusCell source={source} />
                  </td>
                  <td className="text-xs">
                    <p>
                      Success:{" "}
                      {source.lastSuccessAt
                        ? contentDate(source.lastSuccessAt)
                        : "Never"}
                    </p>
                    <p className="mt-1 text-muted">
                      Attempt:{" "}
                      {source.lastFetchedAt
                        ? contentDate(source.lastFetchedAt)
                        : "Never"}
                    </p>
                  </td>
                  <td>{source.failureStreak}</td>
                  <td>
                    <ContentSourceActions
                      enabled={source.enabled}
                      id={source.id}
                      onEdit={() => setEditingId(source.id)}
                    />
                  </td>
                </tr>
                {editingId === source.id ? (
                  <tr>
                    <td
                      className="bg-black/[0.02] p-3 dark:bg-white/[0.03]"
                      colSpan={7}
                    >
                      <ContentSourceForm
                        key={source.id}
                        source={source}
                        onCancel={() => setEditingId(null)}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
