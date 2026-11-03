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
import { pairCatalogModels } from "@/lib/catalog-pairs";
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
  const [sort, setSort] = useState<CatalogSortKey | null>(null);
  const [direction, setDirection] = useState<CatalogSortDirection>("asc");
  const [page, setPage] = useState(1);

  // A model sold twice — a free allocation and the metered id — is one row with
  // two purchase paths, not two rows for the reader to reconcile.
  const paired = useMemo(() => pairCatalogModels(models), [models]);

  const families = useMemo(
    () =>
      Array.from(new Set(paired.map((row) => row.display.family))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [paired],
  );

  const groups = useMemo(() => {
    const map = new Map<string, GroupOption>();

    for (const row of paired) {
      for (const variant of row.variants) {
        map.set(variant.groupSlug, {
          slug: variant.groupSlug,
          label: variant.groupLabel,
          billingMode: variant.groupBillingMode,
        });
      }
    }

    return Array.from(map.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [paired]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = paired.filter((row) => {
      if (group !== "all" && !row.variants.some((v) => v.groupSlug === group))
        return false;
      if (family !== "all" && row.display.family !== family) return false;
      if (!needle) return true;

      return row.variants.some(
        (variant) =>
          variant.id.toLowerCase().includes(needle) ||
          variant.name.toLowerCase().includes(needle) ||
          variant.family.toLowerCase().includes(needle) ||
          (comparisons[variant.id]?.openRouterId ?? "")
            .toLowerCase()
            .includes(needle),
      );
    });

    const decorated = rows.map((row) => ({
      row,
      sortable: {
        id: row.primary.id,
        name: row.display.name,
        family: row.display.family,
        groupLabel: row.display.groupLabel,
        groupBillingMode: row.display.groupBillingMode,
        tokenWeight: row.free?.tokenWeight ?? row.primary.tokenWeight,
        supportsTools: row.variants.some((variant) => variant.supportsTools),
        supportsVision: row.variants.some((variant) => variant.supportsVision),
        inputPricePer1M: row.primary.inputPricePer1M,
        outputPricePer1M: row.primary.outputPricePer1M,
        benchmarkIndex: benchmarks[row.primary.id]?.intelligenceIndex ?? null,
        comparisonBps: comparisons[row.primary.id]?.blendedDeltaBps ?? null,
      } satisfies SortableCatalogRow,
    }));

    if (!sort) return decorated;

    return decorated.sort((left, right) =>
      compareCatalogRows(left.sortable, right.sortable, sort, direction),
    );
  }, [benchmarks, comparisons, direction, family, group, paired, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const matched = useMemo(
    () =>
      paired.filter((row) => comparisons[row.primary.id] !== undefined).length,
    [comparisons, paired],
  );
  const cheaperOnBlend = useMemo(
    () =>
      paired.filter((row) => {
        const comparison = comparisons[row.primary.id];

        return (
          row.primary.access === "paid" &&
          (comparison?.blendedDeltaBps ?? 0) < 0
        );
      }).length,
    [comparisons, paired],
  );

  const showComparison = comparisonAvailable(matched, paired.length);
  const measured = useMemo(
    () =>
      paired.filter((row) => benchmarks[row.primary.id] !== undefined).length,
    [benchmarks, paired],
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
        modelCount={paired.length}
        query={query}
        showComparison={showComparison}
        shownCount={filtered.length}
        onFamily={(value) => resetPage(() => setFamily(value))}
        onGroup={(value) => resetPage(() => setGroup(value))}
        onQuery={(value) => resetPage(() => setQuery(value))}
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
              {/* Widths repeat by design (two 12% columns); the index is the
                  stable identity for a static colgroup. */}
              {columns.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {head("Model", "model")}
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
                    showBenchmarks ? benchmarks[row.primary.id] : undefined
                  }
                  comparison={
                    showComparison ? comparisons[row.primary.id] : undefined
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
