"use client";

import type {
  BenchmarkStatus,
  BenchmarkSummary,
  ModelSummary,
} from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { useMemo, useState } from "react";

import {
  comparisonAvailable,
  deltaClass,
  formatDelta,
  priceProvenance,
  QualityCell,
  RateCell,
  type SortKey,
} from "./catalog-cells";
import { CatalogFilters, type GroupOption } from "./catalog-filters";
import { CatalogFootnote } from "./catalog-footnote";

import { AccessChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";

export function ModelCatalogTable({
  models,
  comparisons = {},
  benchmarks = {},
  benchmarkStatus = null,
  benchmarkFetchedAt = null,
  pageSize = 15,
}: {
  models: ModelSummary[];
  comparisons?: Record<string, PriceComparison>;
  benchmarks?: Record<string, BenchmarkSummary>;
  benchmarkStatus?: BenchmarkStatus | null;
  benchmarkFetchedAt?: string | null;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [family, setFamily] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  const families = useMemo(
    () =>
      Array.from(new Set(models.map((model) => model.family))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [models],
  );

  const groups = useMemo(() => {
    const map = new Map<string, GroupOption>();

    for (const model of models) {
      map.set(model.groupSlug, {
        slug: model.groupSlug,
        label: model.groupLabel,
        billingMode: model.groupBillingMode,
      });
    }

    return Array.from(map.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [models]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = models.filter((model) => {
      if (group !== "all" && model.groupSlug !== group) return false;
      if (family !== "all" && model.family !== family) return false;
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.family.toLowerCase().includes(needle) ||
        (comparisons[model.id]?.openRouterId ?? "")
          .toLowerCase()
          .includes(needle)
      );
    });

    return rows.sort((left, right) => {
      if (sort === "family") {
        return (
          left.family.localeCompare(right.family) ||
          left.name.localeCompare(right.name)
        );
      }

      if (sort === "price-asc") {
        return (
          left.inputPricePer1M - right.inputPricePer1M ||
          left.outputPricePer1M - right.outputPricePer1M
        );
      }

      if (sort === "price-desc") {
        return (
          right.inputPricePer1M - left.inputPricePer1M ||
          right.outputPricePer1M - left.outputPricePer1M
        );
      }

      return left.name.localeCompare(right.name);
    });
  }, [comparisons, family, group, models, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const matched = useMemo(
    () => models.filter((model) => comparisons[model.id] !== undefined).length,
    [comparisons, models],
  );
  const cheaperOnBlend = useMemo(
    () =>
      models.filter((model) => {
        const row = comparisons[model.id];

        return model.access === "paid" && (row?.blendedDeltaBps ?? 0) < 0;
      }).length,
    [comparisons, models],
  );

  const showComparison = comparisonAvailable(matched, models.length);
  const measured = useMemo(
    () => models.filter((model) => benchmarks[model.id] !== undefined).length,
    [benchmarks, models],
  );
  const showBenchmarks = measured > 0;
  // Identity, then one fact per column, then the money, then the verdict.
  const columns = showComparison
    ? showBenchmarks
      ? ["36%", "9%", "6%", "8%", "10%", "16%", "15%"]
      : ["44%", "10%", "7%", "9%", "17%", "13%"]
    : showBenchmarks
      ? ["48%", "11%", "8%", "10%", "8%", "15%"]
      : ["54%", "13%", "9%", "11%", "13%"];

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  return (
    <div className="catalog-shell overflow-hidden rounded-md border border-border bg-surface">
      <CatalogFilters
        cheaperOnBlend={cheaperOnBlend}
        families={families}
        family={family}
        group={group}
        groups={groups}
        matched={matched}
        modelCount={models.length}
        query={query}
        showComparison={showComparison}
        shownCount={filtered.length}
        sort={sort}
        onFamily={(value) => resetPage(() => setFamily(value))}
        onGroup={(value) => resetPage(() => setGroup(value))}
        onQuery={(value) => resetPage(() => setQuery(value))}
        onSort={(value) => resetPage(() => setSort(value))}
      />

      {rows.length === 0 ? (
        <div className="brand-canvas px-6 py-16 text-center text-sm text-muted">
          No models match this filter. Try another search or check back later.
        </div>
      ) : (
        <div
          aria-label="Model catalog"
          className="overflow-x-auto"
          role="region"
        >
          <table className="data-table catalog-table">
            <colgroup>
              {columns.map((width) => (
                <col key={width} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Model</th>
                <th>Group</th>
                <th className="text-right">Weight</th>
                <th className="catalog-col-features text-center">Features</th>
                {showBenchmarks ? (
                  <th className="catalog-col-benchmark text-right">
                    AA Benchmark
                  </th>
                ) : null}
                <th className="text-right">Savant $/1M</th>
                {showComparison ? (
                  <th className="text-right">vs OpenRouter</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => {
                const comparison = showComparison
                  ? comparisons[model.id]
                  : undefined;

                return (
                  <tr key={model.id}>
                    <td className="catalog-model">
                      <div className="truncate font-medium">{model.name}</div>
                      <div className="catalog-sub mono" title={model.id}>
                        {model.family} · {model.contextWindow} · {model.id}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <AccessChip model={model} />
                    </td>
                    <td className="catalog-rate text-right">
                      {model.tokenWeight > 0 ? (
                        <span title="Free-pool token weight">
                          {model.tokenWeight}×
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="catalog-col-features whitespace-nowrap text-center">
                      {model.supportsTools || model.supportsVision ? (
                        <span className="inline-flex items-center gap-2">
                          {model.supportsTools ? (
                            <i
                              aria-hidden
                              className="fa-solid fa-wrench text-[10px] text-muted"
                              title="Supports tools"
                            />
                          ) : null}
                          {model.supportsVision ? (
                            <i
                              aria-hidden
                              className="fa-solid fa-eye text-[10px] text-muted"
                              title="Supports vision"
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {showBenchmarks ? (
                      <td className="catalog-rate text-right">
                        <QualityCell benchmark={benchmarks[model.id]} />
                      </td>
                    ) : null}
                    <td className="catalog-rate text-right">
                      <span
                        className="cursor-help"
                        title={priceProvenance(
                          {
                            input: model.inputPricePer1M,
                            output: model.outputPricePer1M,
                          },
                          model.access,
                          comparison,
                        )}
                      >
                        <RateCell
                          access={model.access}
                          input={model.inputPricePer1M}
                          output={model.outputPricePer1M}
                        />
                      </span>
                    </td>
                    {showComparison ? (
                      <>
                        <td className="catalog-rate text-right">
                          {model.access === "paid" &&
                          comparison?.blendedDeltaBps != null ? (
                            <span
                              className={`inline-flex items-center rounded-[0.2rem] border border-border bg-surface-secondary px-2 py-0.5 text-[11px] ${deltaClass(
                                comparison.blendedDeltaBps,
                              )}`}
                              title={`3 input : 1 output blend vs ${comparison.openRouterId}. Prompt tokens ${formatDelta(
                                comparison.inputDeltaBps,
                              )}, completion tokens ${formatDelta(
                                comparison.outputDeltaBps,
                              )}.`}
                            >
                              {formatDelta(comparison.blendedDeltaBps)}
                            </span>
                          ) : comparison?.blendedDeltaBps != null ? (
                            // Included models are 100 % cheaper than the public
                            // list by definition. Muted text, not a badge: eleven
                            // identical green badges would shout.
                            <span
                              className="text-muted"
                              title={`Included in ${model.access === "free" ? "the free pool" : "a plan"}; ${comparison.openRouterId} lists ${formatPricePer1M(
                                comparison.inputPer1M,
                              )} in / ${formatPricePer1M(
                                comparison.outputPer1M,
                              )} out per 1M.`}
                            >
                              {formatDelta(comparison.blendedDeltaBps)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-black/10 p-4 dark:border-white/10">
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          total={filtered.length}
          onChange={setPage}
        />
      </div>

      <CatalogFootnote
        benchmarkFetchedAt={benchmarkFetchedAt}
        benchmarkStatus={benchmarkStatus}
        showBenchmarks={showBenchmarks}
        showComparison={showComparison}
      />
    </div>
  );
}
