import type { LandingData } from "@/lib/types";

import { Chip } from "@heroui/react";

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
            The free pool, as synced.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Only models the provider exposes on the free pool are routable. Paid
            catalog entries are stored but blocked locally.
          </p>
        </div>
        <Chip color="accent" size="sm" variant="soft">
          {data.stats.freeModelCount} free models
        </Chip>
      </div>

      {data.freeModels.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-sm text-muted">
          The catalog is empty. Open the console, sync the provider, and this
          section fills from the upstream catalog.
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.freeModels.map((model) => (
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
                <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200">
                  free
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted">Context</dt>
                  <dd className="mt-0.5 font-medium">{model.contextWindow}</dd>
                </div>
                <div>
                  <dt className="text-muted">Weight</dt>
                  <dd className="mt-0.5 font-medium">
                    {model.tokenWeight > 0 ? `${model.tokenWeight}×` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Provider</dt>
                  <dd className="mt-0.5 truncate font-medium">
                    {model.provider}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
