"use client";

import type { ModelAccess, ModelSummary } from "@/lib/types";

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

export function ModelCatalogTable({
  models,
  pageSize = 15,
}: {
  models: ModelSummary[];
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
        model.family.toLowerCase().includes(needle)
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
  }, [family, group, models, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-black/10 p-4 dark:border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search the catalog</span>
            <i
              aria-hidden
              className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted"
            />
            <input
              className="h-10 w-full rounded-xl border border-black/10 bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent dark:border-white/10"
              placeholder="Search model, id, or family"
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
              className="h-10 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
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
              className="h-10 max-w-[11rem] rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
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
              className="h-10 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
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
          <span>USD per 1M tokens · Input and output priced separately</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-sm text-muted">
          No models match this filter. Try another search or check back later.
        </div>
      ) : (
        <div
          aria-label="Model catalog"
          className="scroll-shell max-h-[36rem]"
          role="region"
          tabIndex={rows.length > 0 ? 0 : undefined}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Family</th>
                <th>Context</th>
                <th>Group</th>
                <th className="text-right">Input / 1M</th>
                <th className="text-right">Output / 1M</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => (
                <tr key={model.id}>
                  <td className="max-w-[22rem]">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{model.name}</span>
                      {model.supportsTools ? (
                        <i
                          aria-label="Supports tools"
                          className="fa-solid fa-wrench text-[10px] text-muted"
                          title="Supports tools"
                        />
                      ) : null}
                      {model.supportsVision ? (
                        <i
                          aria-label="Supports vision"
                          className="fa-solid fa-eye text-[10px] text-muted"
                          title="Supports vision"
                        />
                      ) : null}
                    </div>
                    <div className="mono mt-0.5 truncate text-[11px] text-muted">
                      {model.id}
                    </div>
                  </td>
                  <td className="text-muted">{model.family}</td>
                  <td className="whitespace-nowrap text-muted">
                    {model.contextWindow}
                  </td>
                  <td>
                    <AccessChip model={model} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {priceLabel(model, "input")}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {priceLabel(model, "output")}
                  </td>
                </tr>
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

      {filtered.length > 0 && group === "all" && family === "all" ? (
        <div className="border-t border-black/10 px-4 py-2 text-[11px] text-muted dark:border-white/10">
          <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
          Effective prices; the gateway enforces the same values at request
          time.
        </div>
      ) : null}
    </div>
  );
}
