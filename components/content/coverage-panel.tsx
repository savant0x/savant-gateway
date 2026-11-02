import type { ModelSummary } from "@/lib/types";
import type { Coverage } from "@/lib/content/types";

import Link from "next/link";

import { WatchButton } from "@/components/content/watch-button";
import { contentDate, relationLabel } from "@/lib/content/format";
import { CONTENT_RELATIONS } from "@/lib/content/types";

export function CoveragePanel({
  model,
  coverage,
  watching,
  signedIn,
}: {
  model: ModelSummary;
  coverage: Coverage;
  watching: boolean;
  signedIn: boolean;
}) {
  const activeRelations = CONTENT_RELATIONS.filter(
    (relation) => coverage.counts[relation] > 0,
  );

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
            Coverage
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
            Articles, videos, papers, repositories, and discussions whose title
            or publisher tag exactly names this model. Coverage is evidence of
            attention, not a quality score.
          </p>
        </div>
        <WatchButton
          modelId={model.id}
          signedIn={signedIn}
          watching={watching}
        />
      </div>

      {coverage.items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-black/15 p-4 text-xs leading-5 text-muted dark:border-white/15">
          No coverage yet. Once an operator ingests a source that names{" "}
          <span className="mono text-foreground">{model.name}</span> in its
          title or tags, the matching piece appears here with the reason it
          matched.
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {activeRelations.map((relation) => (
              <span
                key={relation}
                className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-muted dark:border-white/10"
              >
                {relationLabel(relation)} · {coverage.counts[relation]}
              </span>
            ))}
          </div>

          <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
            {coverage.items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                    {relationLabel(item.relation)}
                  </span>
                  <span>{item.sourceLabel}</span>
                  <span aria-hidden>·</span>
                  <span>{contentDate(item.publishedAt)}</span>
                </div>
                <Link
                  className="mt-1 block text-sm font-medium underline-offset-4 hover:underline"
                  href={`/signal/${item.id}`}
                >
                  {item.title}
                </Link>
                <p className="mt-1 text-[11px] text-muted">{item.reason}</p>
              </li>
            ))}
          </ul>

          {coverage.total > coverage.items.length ? (
            <p className="mt-3 text-[11px] text-muted">
              Showing the newest {coverage.items.length} of {coverage.total}{" "}
              linked pieces.
            </p>
          ) : null}
        </>
      )}

      <p className="mt-4 text-[11px] text-muted">
        Follow this model to include its new coverage in your{" "}
        <Link className="text-accent hover:underline" href="/signal/briefing">
          briefing
        </Link>
        .
      </p>
    </section>
  );
}
