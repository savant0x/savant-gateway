"use client";

import type { ModelAccess, ModelSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { useMemo, useState } from "react";

import { AccessChip } from "@/components/dashboard/chips";
import { formatNumber, formatPricePer1M } from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";

type GroupOption = {
  slug: string;
  label: string;
  billingMode: ModelAccess;
};

type SortKey = "name" | "family" | "price-asc" | "price-desc";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "family", label: "Family" },
  { key: "price-asc", label: "Input price ↑" },
  { key: "price-desc", label: "Input price ↓" },
];

function priceLabel(model: ModelSummary, direction: "input" | "output") {
  if (model.access === "free") return "Free";

  if (model.inputPricePer1M === 0 && model.outputPricePer1M === 0) {
    return model.access === "subscription" ? "Subscription" : "Unpriced";
  }

  return formatPricePer1M(
    direction === "input" ? model.inputPricePer1M : model.outputPricePer1M,
  );
}

function formatDelta(bps: number | null) {
  if (bps === null) return "—";

  const percent = bps / 100;

  if (Math.abs(percent) < 0.1) return "≈ same";

  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toLocaleString(
    "en-US",
    { maximumFractionDigits: 1 },
  )}%`;
}

function deltaClass(bps: number | null) {
  if (bps === null || Math.abs(bps) < 10) return "text-muted";

  return bps < 0 ? "text-success" : "text-danger";
}

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
  const cheaperOnInput = useMemo(
    () =>
      models.filter((model) => {
        const row = comparisons[model.id];

        return (
          model.access === "paid" &&
          row?.inputDeltaBps !== null &&
          (row?.inputDeltaBps ?? 0) < 0
        );
      }).length,
    [comparisons, models],
  );

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  return (
    <div className="catalog-shell overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-black/10 p-5 dark:border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search the catalog</span>
            <i
              aria-hidden
              className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted"
            />
            <input
              className="h-11 w-full rounded-xl border border-black/10 bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent dark:border-white/10"
              placeholder="Search model, id, family, or OpenRouter id"
              type="search"
              value={query}
              onChange={(event) =>
                resetPage(() => setQuery(event.target.value))
              }
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by group"
              className="h-11 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              value={group}
              onChange={(event) =>
                resetPage(() => setGroup(event.target.value))
              }
            >
              <option value="all">All groups</option>
              {groups.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label} ({item.billingMode})
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by family"
              className="h-11 max-w-[11rem] rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              value={family}
              onChange={(event) =>
                resetPage(() => setFamily(event.target.value))
              }
            >
              <option value="all">All families</option>
              {families.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              aria-label="Sort models"
              className="h-11 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              value={sort}
              onChange={(event) =>
                resetPage(() => setSort(event.target.value as SortKey))
              }
            >
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            <i aria-hidden className="fa-solid fa-layer-group mr-1.5" />
            {formatNumber(models.length)} catalogued ·{" "}
            {formatNumber(filtered.length)} shown
          </span>
          <span>
            USD per 1M tokens · {formatNumber(matched)} matched against
            OpenRouter · {formatNumber(cheaperOnInput)} cheaper on input
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-sm text-muted">
          No models match this filter. Try another search or check back later.
        </div>
      ) : (
        <div
          aria-label="Model catalog"
          className="scroll-shell max-h-[68rem]"
          role="region"
          tabIndex={rows.length > 0 ? 0 : undefined}
        >
          <table className="data-table catalog-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Family</th>
                <th>Context</th>
                <th>Group</th>
                <th>Tools</th>
                <th className="text-right">Weight</th>
                <th className="text-right">Savant in / out</th>
                <th className="text-right">OpenRouter in / out</th>
                <th className="text-right">Δ vs OpenRouter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => {
                const comparison = comparisons[model.id];

                return (
                  <tr key={model.id}>
                    <td className="max-w-[20rem]">
                      <div className="truncate font-medium">{model.name}</div>
                      <div className="mono mt-0.5 truncate text-[11px] text-muted">
                        {model.id}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {model.family}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {model.contextWindow}
                    </td>
                    <td>
                      <AccessChip model={model} />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="flex gap-2 text-[11px] text-muted">
                        {model.supportsTools ? (
                          <i
                            aria-label="Supports tools"
                            className="fa-solid fa-wrench"
                            title="Supports tools"
                          />
                        ) : null}
                        {model.supportsVision ? (
                          <i
                            aria-label="Supports vision"
                            className="fa-solid fa-eye"
                            title="Supports vision"
                          />
                        ) : null}
                        {!model.supportsTools && !model.supportsVision ? (
                          <span aria-hidden>—</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right text-muted">
                      {model.tokenWeight > 0 ? `${model.tokenWeight}×` : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {model.inputPricePer1M === 0 &&
                      model.outputPricePer1M === 0 ? (
                        <span className="text-muted">
                          {priceLabel(model, "input")}
                        </span>
                      ) : (
                        <>
                          <div>{priceLabel(model, "input")}</div>
                          <div className="text-[11px] text-muted">
                            {priceLabel(model, "output")}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right text-muted">
                      {comparison ? (
                        <>
                          <div>{formatPricePer1M(comparison.inputPer1M)}</div>
                          <div className="text-[11px]">
                            {formatPricePer1M(comparison.outputPer1M)}
                          </div>
                          <div
                            className="mono mt-0.5 text-[10px]"
                            title={comparison.openRouterId}
                          >
                            {comparison.openRouterId}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {!comparison ? (
                        <span className="text-muted">not listed</span>
                      ) : model.access !== "paid" ? (
                        <span className="text-muted">
                          {model.access === "free"
                            ? "free access"
                            : "plan only"}
                        </span>
                      ) : (
                        <>
                          <div className={deltaClass(comparison.inputDeltaBps)}>
                            {formatDelta(comparison.inputDeltaBps)}
                          </div>
                          <div
                            className={`text-[11px] ${deltaClass(
                              comparison.outputDeltaBps,
                            )}`}
                          >
                            {formatDelta(comparison.outputDeltaBps)}
                          </div>
                        </>
                      )}
                    </td>
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

      <div className="space-y-1 border-t border-black/10 px-4 py-3 text-[11px] text-muted dark:border-white/10">
        <p>
          <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
          Savant prices are the effective values the gateway enforces at request
          time. The delta column compares that sell rate with the OpenRouter
          list rate, not with our upstream cost.
        </p>
        <p>
          <i
            aria-hidden
            className="fa-solid fa-arrow-right-arrow-left mr-1.5"
          />
          OpenRouter rates come from its public model list
          {benchmarkFetchedAt
            ? ` (fetched ${new Date(benchmarkFetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC)`
            : ""}
          , matched by exact upstream id, and use list prompt/completion rates
          only. A missing row means no exact counterpart was listed.
        </p>
      </div>
    </div>
  );
}
