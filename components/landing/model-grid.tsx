import type { LandingData, ModelSummary } from "@/lib/types";

import Link from "next/link";

import { AccessChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";

function priceLabel(model: ModelSummary, direction: "input" | "output") {
  if (model.access === "free") return "Free";

  if (model.inputPricePer1M === 0 && model.outputPricePer1M === 0) {
    return "Not priced";
  }

  const value =
    direction === "input" ? model.inputPricePer1M : model.outputPricePer1M;

  return formatPricePer1M(value);
}

export function ModelGrid({ data }: { data: LandingData }) {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      id="models"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            Live catalog
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            The full catalog, not a free-tier teaser.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Free, subscription-only, and priced models share one endpoint.
            Non-free rows need a sell price before the gateway accepts them;
            upstream cost never ships to the client.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted transition-colors hover:border-cyan-300/30 hover:text-foreground"
          href="/models"
        >
          Compare all {data.stats.modelCount} models
          <i aria-hidden className="fa-solid fa-arrow-right text-xs" />
        </Link>
      </div>

      {data.models.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-sm text-muted">
          The catalog is empty. Open the console, sync the provider, and this
          section fills from the upstream catalog.
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.models.map((model) => (
            <article
              key={model.id}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {model.name}
                  </h3>
                  <p className="mono mt-1 truncate text-[11px] text-muted">
                    {model.id}
                  </p>
                </div>
                <AccessChip model={model} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted">Context</dt>
                  <dd className="mt-0.5 font-medium">{model.contextWindow}</dd>
                </div>
                <div>
                  <dt className="text-muted">Sell price</dt>
                  <dd className="mt-0.5 font-medium">
                    {priceLabel(model, "input")} in
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Family</dt>
                  <dd className="mt-0.5 truncate font-medium">
                    {model.family}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] text-muted">
                Output {priceLabel(model, "output")} / 1M
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
