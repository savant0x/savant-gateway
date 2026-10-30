"use client";

import type { ModelAccess } from "@/lib/types";

import { SORTS, type SortKey } from "./catalog-cells";

import { formatNumber } from "@/components/dashboard/format";

export type GroupOption = {
  slug: string;
  label: string;
  billingMode: ModelAccess;
};

export function CatalogFilters({
  query,
  group,
  family,
  sort,
  groups,
  families,
  modelCount,
  shownCount,
  matched,
  cheaperOnBlend,
  showComparison,
  onQuery,
  onGroup,
  onFamily,
  onSort,
}: {
  query: string;
  group: string;
  family: string;
  sort: SortKey;
  groups: GroupOption[];
  families: string[];
  modelCount: number;
  shownCount: number;
  matched: number;
  cheaperOnBlend: number;
  showComparison: boolean;
  onQuery: (value: string) => void;
  onGroup: (value: string) => void;
  onFamily: (value: string) => void;
  onSort: (value: SortKey) => void;
}) {
  return (
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
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by group"
            className="h-11 rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
            value={group}
            onChange={(event) => onGroup(event.target.value)}
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
            onChange={(event) => onFamily(event.target.value)}
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
            onChange={(event) => onSort(event.target.value as SortKey)}
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
          {formatNumber(modelCount)} models · {formatNumber(shownCount)} shown
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
  );
}
