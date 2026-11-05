import type { ModelSummary } from "@/lib/types";

import Link from "next/link";

import { ModelClickLink } from "./model-click-link";

import { AccessChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";
import { purchaseCta } from "@/lib/content/format";

export type LinkedModel = {
  model: ModelSummary;
  reason: string;
};

/**
 * One purchase path for the whole site. The module shows the catalog's live
 * sell price and access mode; it never computes a content-specific price.
 */
export function ModelModule({
  models,
  signedIn,
  contentId,
  heading = "Models in this piece",
}: {
  models: LinkedModel[];
  signedIn: boolean;
  contentId?: string;
  heading?: string;
}) {
  if (models.length === 0) return null;

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
            {heading}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Prices are the gateway&apos;s live sell price per million tokens.
          </p>
        </div>
        <Link className="text-xs text-accent hover:underline" href="/models">
          Compare all models
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {models.map(({ model, reason }) => {
          const cta = purchaseCta(model.access, signedIn);

          return (
            <div
              key={model.id}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <ModelClickLink
                    className="font-semibold underline-offset-4 hover:underline"
                    contentId={contentId}
                    href={`/models/${model.id}`}
                    modelId={model.id}
                  >
                    {model.name}
                  </ModelClickLink>
                  <p className="mono mt-0.5 text-[11px] text-muted">
                    {model.id}
                  </p>
                </div>
                <AccessChip model={model} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Input / 1M</dt>
                  <dd className="mt-0.5 font-medium">
                    {formatPricePer1M(model.inputPricePer1M)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Output / 1M</dt>
                  <dd className="mt-0.5 font-medium">
                    {formatPricePer1M(model.outputPricePer1M)}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-muted">Matched because</dt>
                  <dd className="mt-0.5 text-muted">{reason}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
                  href={cta.href}
                >
                  {cta.label}
                </Link>
                <ModelClickLink
                  className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                  contentId={contentId}
                  href={`/models/${model.id}`}
                  modelId={model.id}
                >
                  Model details
                </ModelClickLink>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
