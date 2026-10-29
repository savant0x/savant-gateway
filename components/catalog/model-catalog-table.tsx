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

/**
 * One rate when input and output cost the same, two when they differ. A zero
 * output rate is reported as a single input rate with a title, never as $0.
 */
function RateCell({ input, output }: { input: number; output: number }) {
  const hasInput = input > 0;
  const hasOutput = output > 0;

  if (!hasInput && !hasOutput) return <span className="text-muted">—</span>;

  if (!hasOutput || input === output) {
    return (
      <span
        title={
          hasOutput
            ? "The same rate applies to input and output tokens"
            : "Upstream publishes no output rate for this model"
        }
      >
        {formatPricePer1M(hasInput ? input : output)}
      </span>
    );
  }

  return (
    <>
      <div>{formatPricePer1M(input)}</div>
      <div className="text-[11px] text-muted">{formatPricePer1M(output)}</div>
    </>
  );
}

/**
 * With 44 rows against a 456-entry public list, zero matches means the benchmark
 * could not be fetched, not that nothing overlaps. In that case the comparison
 * columns are hidden instead of printing "not listed" on every row.
 */
function comparisonAvailable(matched: number, models: number) {
  return matched > 0 && models > 0;
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
            {formatNumber(models.length)} models ·{" "}
            {formatNumber(filtered.length)} shown
          </span>
          <span>
            {showComparison ? (
              <>
                <i
                  aria-hidden
                  className="fa-solid fa-arrow-right-arrow-left mr-1.5"
                />
                {formatNumber(matched)} compared with OpenRouter ·{" "}
                {formatNumber(cheaperOnBlend)} cheaper on a 3:1 blend
              </>
            ) : (
              <>
                <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
                OpenRouter comparison unavailable right now
              </>
            )}
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

      <div className="space-y-1 border-t border-black/10 px-4 py-3 text-[11px] text-muted dark:border-white/10">
        <p>
          <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
          Prices are USD per 1M tokens. One number means the same rate applies
          to input and output; two numbers are input then output. These are the
          sell rates the gateway enforces at request time, not our upstream
          cost. Plan rows show a dash because access is sold with a plan, and
          free rows cost nothing while the shared allowance lasts.
        </p>
        <p>
          <i
            aria-hidden
            className="fa-solid fa-arrow-right-arrow-left mr-1.5"
          />
          {showComparison ? (
            <>
              The “vs list” pill weighs three prompt tokens to one completion
              token, because the two directions are priced independently and we
              can be dearer on one while far cheaper on the other. Hover it for
              both. Compared against OpenRouter’s public model list
              {benchmarkFetchedAt
                ? ` fetched ${new Date(benchmarkFetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`
                : ""}
              , matched by exact upstream id. A dash means no exact counterpart
              was listed.
            </>
          ) : (
            <>
              OpenRouter’s public list could not be fetched, so the comparison
              columns are hidden rather than showing every row as unlisted. The
              catalog and its own prices are unaffected.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
