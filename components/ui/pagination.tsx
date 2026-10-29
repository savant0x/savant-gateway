"use client";

import { Button } from "@heroui/react";

export function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return (
      <p className="text-xs text-muted">
        {total} {total === 1 ? "row" : "rows"}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        Page {page} of {pageCount} · {total} rows
      </p>
      <div className="flex items-center gap-2">
        <Button
          isDisabled={page <= 1}
          size="sm"
          variant="secondary"
          onPress={() => onChange(page - 1)}
        >
          <i aria-hidden className="fa-solid fa-chevron-left" />
          Previous
        </Button>
        <Button
          isDisabled={page >= pageCount}
          size="sm"
          variant="secondary"
          onPress={() => onChange(page + 1)}
        >
          Next
          <i aria-hidden className="fa-solid fa-chevron-right" />
        </Button>
      </div>
    </div>
  );
}
