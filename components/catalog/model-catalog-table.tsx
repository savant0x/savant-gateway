"use client";

import type {
  BenchmarkStatus,
  BenchmarkSummary,
  ModelSummary,
} from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { useMemo, useState } from "react";

import { comparisonAvailable } from "./catalog-cells";
import { CatalogFilters, type GroupOption } from "./catalog-filters";
import { CatalogFootnote } from "./catalog-footnote";
import { CatalogRow } from "./catalog-row";
import { SortableHead } from "./catalog-sort-head";

import {
  compareCatalogRows,
  defaultSortDirection,
  type CatalogSortDirection,
  type CatalogSortKey,
  type SortableCatalogRow,
} from "@/lib/catalog-sort";
import { catalogSkuRows } from "@/lib/catalog-skus";
import { Pagination } from "@/components/ui/pagination";
import { StatePanel } from "@/components/ui/state-panel";

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
  const [sort, setSort] = useState<CatalogSortKey | null>(null);
  const [direction, setDirection] = useState<CatalogSortDirection>("asc");
  const [page, setPage] = useState(1);

  // One row per SKU. Free, paid and subscription are separate products with
  // their own ids, names and detail pages; same-tier provider rows still merge.
  const skus = useMemo(() => catalogSkuRows(models), [models]);

  const families = useMemo(
    () =>
      Array.from(new Set(skus.map((row) => row.model.family))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [skus],
  );

  const groups = useMemo(() => {
    const map = new Map<string, GroupOption>();

    for (const row of skus) {
      const model = row.model;

      map.set(model.groupSlug, {
        slug: model.groupSlug,
        label: model.groupLabel,
        billingMode: model.groupBillingMode,
      });
    }

    return Array.from(map.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [skus]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = skus.filter((row) => {
      const model = row.model;

      if (group !== "all" && model.groupSlug !== group) return false;
      if (family !== "all" && model.family !== family) return false;
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.family.toLowerCase().includes(needle) ||
        (comparisons[model.id]?.openRouterId ?? "")
          .toLowerCase()
          .includes(needle)
      );
    });

    const decorated = rows.map((row) => ({
      row,
      sortable: {
        id: row.model.id,
        name: row.name,
        family: row.model.family,
        groupLabel: row.model.groupLabel,
        groupBillingMode: row.model.groupBillingMode,
        tokenWeight: row.model.tokenWeight,
        supportsTools: row.model.supportsTools,
        supportsVision: row.model.supportsVision,
        inputPricePer1M: row.model.inputPricePer1M,
        outputPricePer1M: row.model.outputPricePer1M,
        benchmarkIndex: benchmarks[row.model.id]?.intelligenceIndex ?? null,
        comparisonBps: comparisons[row.model.id]?.blendedDeltaBps ?? null,
      } satisfies SortableCatalogRow,
    }));

    if (!sort) return decorated;

    return decorated.sort((left, right) =>
      compareCatalogRows(left.sortable, right.sortable, sort, direction),
    );
  }, [benchmarks, comparisons, direction, family, group, query, skus, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const matched = useMemo(
    () => skus.filter((row) => comparisons[row.model.id] !== undefined).length,
    [comparisons, skus],
  );
  const cheaperOnBlend = useMemo(
    () =>
      skus.filter((row) => {
        const comparison = comparisons[row.model.id];

        return (
          row.model.access === "paid" && (comparison?.blendedDeltaBps ?? 0) < 0
        );
      }).length,
    [comparisons, skus],
  );

  const showComparison = comparisonAvailable(matched, skus.length);
  const measured = useMemo(
    () => skus.filter((row) => benchmarks[row.model.id] !== undefined).length,
    [benchmarks, skus],
  );
  const showBenchmarks = measured > 0;
  // Identity, then one fact per column, then the money, then the verdict.
  const columns = showComparison
    ? showBenchmarks
      ? ["30%", "8%", "6%", "7%", "9%", "13%", "12%", "12%"]
      : ["36%", "9%", "7%", "8%", "15%", "12%", "13%"]
    : showBenchmarks
      ? ["40%", "10%", "7%", "9%", "7%", "14%", "13%"]
      : ["46%", "12%", "8%", "9%", "12%", "13%"];

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  function toggleSort(key: CatalogSortKey) {
    resetPage(() => {
      if (key === sort) {
        setDirection(direction === "asc" ? "desc" : "asc");

        return;
      }

      setSort(key);
      setDirection(defaultSortDirection(key));
    });
  }

  const head = (label: string, key: CatalogSortKey, className?: string) => (
    <SortableHead
      key={key}
      activeKey={sort}
      className={className}
      direction={direction}
      label={label}
      sortKey={key}
      onSort={toggleSort}
    />
  );

  return (
    <div className="catalog-shell overflow-hidden rounded-md border border-border bg-surface">
      <CatalogFilters
        cheaperOnBlend={cheaperOnBlend}
        families={families}
        family={family}
        group={group}
        groups={groups}
        matched={matched}
        modelCount={skus.length}
        query={query}
        showComparison={showComparison}
        shownCount={filtered.length}
        onFamily={(value) => resetPage(() => setFamily(value))}
        onGroup={(value) => resetPage(() => setGroup(value))}
        onQuery={(value) => resetPage(() => setQuery(value))}
      />

      {rows.length === 0 ? (
        <StatePanel
          action={
            <button
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              type="button"
              onClick={() =>
                resetPage(() => {
                  setQuery("");
                  setFamily("all");
                  setGroup("all");
                })
              }
            >
              Clear filters
            </button>
          }
          className="m-6 text-center"
          description="No model matches the current search, family, or group filters. Clear the filters to see the full catalog."
          state="empty"
          title="No models match this filter."
        />
      ) : (
        <div
          aria-label="Model catalog"
          className="overflow-x-auto"
          role="region"
        >
          <table className="data-table catalog-table">
            <colgroup>
              {/* Widths repeat by design (two 12% columns); the index is the
                  stable identity for a static colgroup. */}
              {columns.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {head("Model / SKU", "model")}
                {head("Group", "group")}
                {head("Weight", "weight", "text-right")}
                {head(
                  "Features",
                  "features",
                  "catalog-col-features text-center",
                )}
                {showBenchmarks
                  ? head(
                      "AA Benchmark",
                      "benchmark",
                      "catalog-col-benchmark text-right",
                    )
                  : null}
                {head("Savant $/1M", "price", "text-right")}
                {showComparison
                  ? head("vs OpenRouter", "comparison", "text-right")
                  : null}
                <th className="text-right">Get access</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row }) => (
                <CatalogRow
                  key={row.key}
                  benchmark={
                    showBenchmarks ? benchmarks[row.model.id] : undefined
                  }
                  comparison={
                    showComparison ? comparisons[row.model.id] : undefined
                  }
                  row={row}
                  showBenchmarks={showBenchmarks}
                  showComparison={showComparison}
                />
              ))}
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
