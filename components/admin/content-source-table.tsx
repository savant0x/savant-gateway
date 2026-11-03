"use client";

import type { ContentSource } from "@/lib/content/types";

import { Fragment, useState } from "react";

import { ContentSourceActions } from "./content-source-actions";
import { ContentSourceForm } from "./content-source-form";

import { contentDate } from "@/lib/content/format";

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
