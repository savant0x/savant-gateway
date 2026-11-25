import type { ModelSummary } from "@/lib/types";

import Link from "next/link";

import { ModelClickLink } from "./model-click-link";

import { AccessChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";
import { purchaseCta } from "@/lib/content/format";
import { displayModelId, modelIdLeaf, modelPath } from "@/lib/model-identity";

export type LinkedModel = {
  model: ModelSummary | null;
  /** The catalog id this card quotes, or the last known id when it is gone. */
  modelId: string;
  reason: string;
  /**
   * Other catalog rows selling the same weights. Used for the count only: a row
   * id carries its upstream account slug, so none of them is printed
   * (FID-2026-1125-002).
   */
  providers: string[];
};

/**
 * One purchase path for the whole site. The module shows the catalog's live
 * sell price and access mode; it never computes a content-specific price.
 *
 * One card per model rather than per catalog row: the same weights sold by
 * several providers used to render several identical-looking cards.
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
        {models.map(({ model, modelId, reason, providers }) => {
          if (!model) {
            return (
              <div
                key={modelId}
                className="rounded-lg border border-dashed border-black/10 p-3 dark:border-white/10"
              >
                <p className="mono text-xs text-muted">
                  {modelIdLeaf(modelId)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Not currently sold here. This piece named it; the catalog does
                  not carry it today.
                </p>
                <p className="mt-2 text-[11px] text-muted">{reason}</p>
              </div>
            );
          }

          const cta = purchaseCta(model.access, signedIn);
          const detailHref = modelPath(model.id, model.upstreamSlug);

          return (
            <div
              key={modelId}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <ModelClickLink
                    className="font-semibold underline-offset-4 hover:underline"
                    contentId={contentId}
                    href={detailHref}
                    modelId={displayModelId(model.id, model.upstreamSlug)}
                  >
                    {model.name}
                  </ModelClickLink>
                  <p className="mono mt-0.5 text-[11px] text-muted">
                    {displayModelId(model.id, model.upstreamSlug)}
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

              {providers.length > 0 ? (
                <p className="mt-3 text-[11px] text-muted">
                  The same weights are listed in {providers.length} other
                  catalog{providers.length === 1 ? " entry" : " entries"}; this
                  card quotes the lowest sell price.
                </p>
              ) : null}

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
                  href={detailHref}
                  modelId={displayModelId(model.id, model.upstreamSlug)}
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
