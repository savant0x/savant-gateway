"use client";

import type { ModelSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { useMemo, useState } from "react";

import {
  comparisonAvailable,
  deltaClass,
  formatDelta,
  RateCell,
  type SortKey,
} from "./catalog-cells";
import { CatalogFilters, type GroupOption } from "./catalog-filters";
import { CatalogFootnote } from "./catalog-footnote";

import { AccessChip } from "@/components/dashboard/chips";
import { Pagination } from "@/components/ui/pagination";

export function ModelCatalogTable({
  models,
  comparisons = {},
  benchmarkFetchedAt = null,
  pageSize = 15,
}: {
  models: ModelSummary[];
  comparisons?: Record<string, PriceComparison>;
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
        <div className="p-8 text-sm text-muted">
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
              <col style={{ width: "40%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              {showComparison ? (
                <>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                </>
              ) : null}
            </colgroup>
            <thead>
              <tr>
                <th>Model</th>
                <th>Group</th>
                <th className="text-right">Savant $/1M</th>
                {showComparison ? (
                  <>
                    <th className="text-right">OpenRouter $/1M</th>
                    <th className="text-right">vs list</th>
                  </>
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
                    <td className="max-w-[32rem]">
                      <div className="truncate font-medium">{model.name}</div>
                      <div className="mono mt-0.5 truncate text-[11px] text-muted">
                        {model.family} · {model.contextWindow} · {model.id}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <AccessChip model={model} />
                        {model.tokenWeight > 0 ? (
                          <span
                            className="mono text-[10px] text-muted"
                            title="Free-pool token weight"
                          >
                            {model.tokenWeight}×
                          </span>
                        ) : null}
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
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <RateCell
                        input={model.inputPricePer1M}
                        output={model.outputPricePer1M}
                      />
                    </td>
                    {showComparison ? (
                      <>
                        <td className="whitespace-nowrap text-right text-muted">
                          {comparison ? (
                            <span title={comparison.openRouterId}>
                              <RateCell
                                input={comparison.inputPer1M}
                                output={comparison.outputPer1M}
                              />
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {model.access === "paid" &&
                          comparison?.blendedDeltaBps != null ? (
                            <span
                              className={`inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] ${deltaClass(
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
        showComparison={showComparison}
      />
    </div>
  );
}
