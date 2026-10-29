import type { Metadata } from "next";

import Link from "next/link";

import { ModelCatalogTable } from "@/components/catalog/model-catalog-table";
import { formatNumber } from "@/components/dashboard/format";
import { primaryCta, secondaryCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { siteConfig } from "@/config/site";
import { getOpenRouterModels } from "@/lib/openrouter-prices";
import {
  buildCatalogComparison,
  summarizeComparison,
} from "@/lib/price-comparison";
import { getCatalogData } from "@/lib/store";

export const dynamic = "force-dynamic";

function formatSignedPercent(bps: number) {
  const percent = bps / 100;

  if (Math.abs(percent) < 0.1) return "on par";

  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toLocaleString(
    "en-US",
    { maximumFractionDigits: 1 },
  )}%`;
}

export const metadata: Metadata = {
  title: "Model catalog",
  description:
    "Every model on Savant Gateway with its family, price group, and per-million-token price.",
};

export default async function ModelsPage() {
  const data = getCatalogData();
  const benchmark = await getOpenRouterModels();
  const comparison = buildCatalogComparison(data.models, benchmark.models);
  const paidComparisons = data.models
    .filter((model) => model.access === "paid")
    .map((model) => comparison.comparisons[model.id])
    .filter((row) => row !== undefined);
  const positioning = summarizeComparison(paidComparisons);
  const benchmarkFetchedAt =
    benchmark.models.length > 0
      ? new Date(benchmark.fetchedAt).toISOString()
      : null;

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[96rem] px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Savant Gateway · provider catalog
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Find your model. Know your cost.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Compare the complete enabled catalog, with input and output rates
              shown separately. Paid models use prepaid credit. Plan-only models
              require a subscription that includes them, and free-pool access
              depends on shared upstream capacity.
            </p>

            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-server mr-2 text-cyan-300"
                />
                Provider: {siteConfig.provider.name}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-layer-group mr-2 text-cyan-300"
                />
                {formatNumber(data.stats.modelCount)} models
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-gift mr-2 text-emerald-300"
                />
                {formatNumber(data.stats.freeModelCount)} free
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i aria-hidden className="fa-solid fa-tag mr-2 text-cyan-300" />
                {formatNumber(data.stats.paidModelCount)} priced
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-key mr-2 text-amber-300"
                />
                {data.stats.subscriptionModelCount} subscription-only
              </span>
            </div>

            {positioning.rows > 0 && positioning.input.medianBps !== null ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    Median input vs list
                  </p>
                  <p
                    className={`mt-1 text-2xl font-semibold tracking-[-0.02em] ${
                      positioning.input.medianBps < 0
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    {formatSignedPercent(positioning.input.medianBps)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    the midpoint of {formatNumber(positioning.rows)} matched
                    paid rows, where {formatNumber(positioning.input.cheaper)}{" "}
                    are below list
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    Median output vs list
                  </p>
                  <p
                    className={`mt-1 text-2xl font-semibold tracking-[-0.02em] ${
                      (positioning.output.medianBps ?? 0) < 0
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    {positioning.output.medianBps === null
                      ? "—"
                      : formatSignedPercent(positioning.output.medianBps)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    completion tokens carry the widest upstream spread, so the
                    gap is widest here
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    Exact-id coverage
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
                    {formatNumber(comparison.matched)} of{" "}
                    {formatNumber(comparison.total)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    rows matched to a public OpenRouter id; the rest are priced
                    by us with no listed counterpart
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link className={primaryCta} href="/account">
                Open your account
              </Link>
              <Link className={secondaryCta} href="/#quickstart">
                See the request
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[96rem] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Full catalog and price comparison
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                Every enabled model with its billing group, weighted free-pool
                cost, Savant rate, and the OpenRouter list rate where an exact
                counterpart exists.
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted">
              {formatNumber(comparison.matched)} /{" "}
              {formatNumber(data.models.length)} matched
            </span>
          </div>
          <ModelCatalogTable
            benchmarkFetchedAt={benchmarkFetchedAt}
            comparisons={comparison.comparisons}
            models={data.models}
            pageSize={Math.max(1, data.models.length)}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
