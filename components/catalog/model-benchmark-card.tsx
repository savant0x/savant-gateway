import type { BenchmarkSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { QualityCell, benchmarkTitle, formatDelta } from "./catalog-cells";

import { formatPricePer1M } from "@/components/dashboard/format";

/**
 * The catalog table carries a quality score and a list-rate delta; a reader who
 * opens one model should not lose them. Both are optional: a dash is
 * "unmeasured" or "not listed", never a zero.
 */
export function ModelBenchmarkCard({
  benchmark,
  comparison,
  listLoaded,
}: {
  benchmark?: BenchmarkSummary;
  comparison?: PriceComparison;
  listLoaded: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Benchmark and list price
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">AA Intelligence Index</dt>
          <dd className="mt-1 text-2xl font-semibold">
            <QualityCell benchmark={benchmark} />
          </dd>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            {benchmark
              ? benchmarkTitle(benchmark)
              : "Not measured by Artificial Analysis."}
          </p>
        </div>
        <div>
          <dt className="text-xs text-muted">OpenRouter list / 1M</dt>
          <dd className="mt-1 text-2xl font-semibold">
            {comparison
              ? `${formatPricePer1M(comparison.inputPer1M)} · ${formatPricePer1M(
                  comparison.outputPer1M,
                )}`
              : "—"}
          </dd>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            {comparison
              ? `Input then output. Savant is ${formatDelta(
                  comparison.blendedDeltaBps,
                )} on the 3:1 blend against ${comparison.openRouterId}.`
              : listLoaded
                ? "No exact OpenRouter counterpart is listed."
                : "OpenRouter’s public list could not be fetched."}
          </p>
        </div>
      </dl>
    </div>
  );
}
