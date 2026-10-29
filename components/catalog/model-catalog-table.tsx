"use client";

import type { ModelAccess, ModelSummary } from "@/lib/types";

import { useMemo, useState } from "react";

import { AccessChip } from "@/components/dashboard/chips";
import { formatNumber, formatPricePer1M } from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";

type AccessFilter = "all" | ModelAccess;
type SortKey = "name" | "provider" | "price-asc" | "price-desc";

const ACCESS_FILTERS: Array<{ key: AccessFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "subscription", label: "Subscription" },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "provider", label: "Provider" },
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
  const [access, setAccess] = useState<AccessFilter>("all");
  const [provider, setProvider] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  const providers = useMemo(
    () =>
      Array.from(new Set(models.map((model) => model.provider))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [models],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = models.filter((model) => {
      if (access !== "all" && model.access !== access) return false;
      if (provider !== "all" && model.provider !== provider) return false;
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle)
      );
    });

    return rows.sort((left, right) => {
      if (sort === "provider") {
        return (
          left.provider.localeCompare(right.provider) ||
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
  }, [access, models, provider, query, sort]);

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
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
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
              placeholder="Search model, id, or provider"
              type="search"
              value={query}
              onChange={(event) =>
                resetPage(() => setQuery(event.target.value))
              }
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by access"
              className="h-10 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              value={access}
              onChange={(event) =>
                resetPage(() => setAccess(event.target.value as AccessFilter))
              }
            >
              {ACCESS_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by provider"
              className="h-10 max-w-[11rem] rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              value={provider}
              onChange={(event) =>
                resetPage(() => setProvider(event.target.value))
              }
            >
              <option value="all">All providers</option>
              {providers.map((name) => (
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
          <span>
            Prices are USD per 1M tokens and exclude upstream provider terms.
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-sm text-muted">
          No models match this filter. Sync the provider or clear the search.
        </div>
      ) : (
        <div className="scroll-shell max-h-[36rem]">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Context</th>
                <th>Access</th>
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
                  <td className="text-muted">{model.provider}</td>
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

      {filtered.length > 0 && access === "all" && provider === "all" ? (
        <div className="border-t border-black/10 px-4 py-2 text-[11px] text-muted dark:border-white/10">
          <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
          Effective prices; the gateway enforces the same values at request
          time.
        </div>
      ) : null}
    </div>
  );
}
