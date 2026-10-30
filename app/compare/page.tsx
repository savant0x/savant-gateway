import type { Metadata } from "next";
import type { PriceComparison } from "@/lib/price-comparison";
import type { BenchmarkSummary, ModelSummary } from "@/lib/types";

import Link from "next/link";

import { CompareTable } from "@/components/compare/compare-table";
import { ModelPicker } from "@/components/compare/model-picker";
import { formatLatency } from "@/components/catalog/catalog-cells";
import { formatPricePer1M } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { ensureBenchmarksFresh } from "@/lib/benchmark-sync";
import { betterSide, resolveComparePair } from "@/lib/compare";
import { AA_ATTRIBUTION_URL } from "@/lib/benchmarks";
import { getOpenRouterModels } from "@/lib/openrouter-prices";
import { buildCatalogComparison, blendedPer1M } from "@/lib/price-comparison";
import {
  getBenchmarkStatus,
  getCatalogData,
  listBenchmarks,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare models",
  description:
    "Two models side by side: Savant rates, OpenRouter list rates, capabilities and measured benchmarks.",
};

function single(value: string | string[] | undefined) {
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;
}

function Verdict({
  label,
  winner,
  detail,
}: {
  label: string;
  winner: string | null;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 canvas-surface px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.01em]">
        {winner ?? "Not comparable"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function winnerName(
  winner: "left" | "right" | null,
  left: ModelSummary,
  right: ModelSummary,
) {
  if (winner === null) return null;

  return winner === "left" ? left.name : right.name;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = getCatalogData();
  const requested = {
    a: single(params.a),
    b: single(params.b),
  };
  // Stored rows only; the freshness check may start a sync but never waits on
  // one, so a slow benchmark source cannot delay this response.
  const benchmarks = listBenchmarks();
  const status = getBenchmarkStatus(data.models.length);

  ensureBenchmarksFresh();

  const pair = resolveComparePair(data.models, requested.a, requested.b);

  const benchmark = await getOpenRouterModels();
  const comparison = buildCatalogComparison(data.models, benchmark.models);
  const listFetchedAt =
    benchmark.models.length > 0
      ? new Date(benchmark.fetchedAt).toISOString()
      : null;

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[96rem] px-4 py-14 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Compare · provider catalog
            </p>
            {pair ? (
              <>
                <h1 className="mt-3 max-w-6xl text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                  {pair.left.name}
                  <span className="mx-3 text-muted">vs</span>
                  {pair.right.name}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
                  One attribute per line, both models on it: our rate, the
                  public list rate, what each model can do, and the benchmark we
                  can measure. A dash is a missing measurement, never a zero.
                </p>
                <ModelPicker
                  leftId={pair.left.id}
                  models={data.models.map((model) => ({
                    id: model.id,
                    name: model.name,
                    family: model.family,
                  }))}
                  rightId={pair.right.id}
                />
              </>
            ) : (
              <>
                <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                  Nothing to compare yet.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
                  The catalog needs at least two models before a comparison can
                  be drawn from it. Sync the provider, then come back.
                </p>
                <Link
                  className="mt-7 inline-flex h-11 items-center rounded-lg border border-white/10 px-4 text-sm transition-colors hover:border-accent/50"
                  href="/models"
                >
                  Browse the catalog
                </Link>
              </>
            )}
          </div>
        </section>

        {pair ? (
          <CompareBody
            benchmarks={benchmarks}
            comparison={comparison.comparisons}
            left={pair.left}
            listFetchedAt={listFetchedAt}
            right={pair.right}
            status={status}
          />
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}

function CompareBody({
  left,
  right,
  benchmarks,
  comparison,
  status,
  listFetchedAt,
}: {
  left: ModelSummary;
  right: ModelSummary;
  benchmarks: Record<string, BenchmarkSummary>;
  comparison: Record<string, PriceComparison>;
  status: ReturnType<typeof getBenchmarkStatus>;
  listFetchedAt: string | null;
}) {
  const leftBench = benchmarks[left.id] ?? null;
  const rightBench = benchmarks[right.id] ?? null;
  const leftBlend = blendedPer1M(left.inputPricePer1M, left.outputPricePer1M);
  const rightBlend = blendedPer1M(
    right.inputPricePer1M,
    right.outputPricePer1M,
  );
  const priceWinner = betterSide(leftBlend, rightBlend, "lower");
  const indexWinner = betterSide(
    leftBench?.intelligenceIndex ?? null,
    rightBench?.intelligenceIndex ?? null,
    "higher",
  );
  const speedWinner = betterSide(
    leftBench?.ttftSeconds ?? null,
    rightBench?.ttftSeconds ?? null,
    "lower",
  );

  return (
    <section className="brand-canvas border-t border-border">
      <div className="mx-auto w-full max-w-[96rem] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Verdict
            detail={
              priceWinner === null
                ? "Both blend to the same rate per 1M tokens."
                : `${formatPricePer1M(
                    priceWinner === "left" ? leftBlend : rightBlend,
                  )} per 1M at three prompt tokens to one completion token, against ${formatPricePer1M(
                    priceWinner === "left" ? rightBlend : leftBlend,
                  )}.`
            }
            label="Cheaper on 3:1 blend"
            winner={winnerName(priceWinner, left, right)}
          />
          <Verdict
            detail={
              !status.configured
                ? "No benchmark source is configured on this server."
                : indexWinner === null
                  ? "Neither model has a stored index, or both are equal."
                  : `Intelligence Index ${
                      indexWinner === "left"
                        ? (leftBench?.intelligenceIndex ?? 0).toFixed(1)
                        : (rightBench?.intelligenceIndex ?? 0).toFixed(1)
                    } against ${
                      indexWinner === "left"
                        ? (rightBench?.intelligenceIndex ?? 0).toFixed(1)
                        : (leftBench?.intelligenceIndex ?? 0).toFixed(1)
                    }.`
            }
            label="Higher AA Benchmark"
            winner={winnerName(indexWinner, left, right)}
          />
          <Verdict
            detail={
              speedWinner === null
                ? "Neither model has a stored time to first token, or both are equal."
                : `${formatLatency(
                    (speedWinner === "left"
                      ? leftBench?.ttftSeconds
                      : rightBench?.ttftSeconds) ?? 0,
                  )} against ${formatLatency(
                    (speedWinner === "left"
                      ? rightBench?.ttftSeconds
                      : leftBench?.ttftSeconds) ?? 0,
                  )}.`
            }
            label="Faster first token"
            winner={winnerName(speedWinner, left, right)}
          />
        </div>

        <CompareTable
          benchmarks={benchmarks}
          comparisons={comparison}
          left={left}
          right={right}
        />

        <p className="mt-4 font-mono text-[10px] leading-6 text-muted">
          AA Benchmark is the{" "}
          <a
            className="underline decoration-dotted"
            href={AA_ATTRIBUTION_URL}
            rel="noreferrer"
            target="_blank"
          >
            Artificial Analysis
          </a>{" "}
          Intelligence, Coding and Agentic indices
          {status.indexVersion ? ` (index v${status.indexVersion})` : ""}
          {status.syncedAt ? (
            <>
              , measured <LocalTime value={status.syncedAt} />
            </>
          ) : null}
          .{" "}
          {status.configured
            ? "A model with no stored row shows a dash rather than an unmeasured score."
            : "Benchmark data is unavailable: no source key is configured on this server."}{" "}
          List rates come from OpenRouter&apos;s public model list
          {listFetchedAt ? (
            <>
              , fetched <LocalTime value={listFetchedAt} />
            </>
          ) : null}
          {listFetchedAt
            ? "; a model with no exact public id shows a dash."
            : "; the list is unavailable right now, so the list rows are hidden."}
        </p>
      </div>
    </section>
  );
}
