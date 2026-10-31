"use client";

import type { CatalogSortDirection, CatalogSortKey } from "@/lib/catalog-sort";

/**
 * A column header that is the sort control. `aria-sort` is set on the header
 * cell, not the button, so a screen reader announces the table's state before
 * the control it can activate.
 */
export function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  className,
  onSort,
}: {
  label: string;
  sortKey: CatalogSortKey;
  activeKey: CatalogSortKey | null;
  direction: CatalogSortDirection;
  className?: string;
  onSort: (key: CatalogSortKey) => void;
}) {
  const active = activeKey === sortKey;

  return (
    <th
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <button
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
        title={`Sort by ${label.toLowerCase()}`}
        type="button"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <i
          aria-hidden
          className={`fa-solid ${
            active
              ? direction === "asc"
                ? "fa-sort-up"
                : "fa-sort-down"
              : "fa-sort"
          } text-[10px] ${active ? "text-accent" : "text-muted/60"}`}
        />
      </button>
    </th>
  );
}
