"use client";

import type { AdminModelSummary } from "@/lib/types";
import type { PriceDraft } from "./pricing-draft";

import { Button, Card, Chip, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { initialPrice, parseDraftPrice } from "./pricing-draft";
import { PricingRow } from "./pricing-row";

import { formatPricePer1M } from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";

type Filter = "all" | "priced" | "unpriced" | "free";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "priced", label: "Priced" },
  { key: "unpriced", label: "Unpriced" },
  { key: "free", label: "Free" },
];

export function PricingTable({
  models,
  pageSize = 15,
}: {
  models: AdminModelSummary[];
  pageSize?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const catalog = useMemo(
    () => models.filter((model) => model.inCatalog),
    [models],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return catalog.filter((model) => {
      const priced =
        model.access === "free" ||
        model.inputPricePer1M > 0 ||
        model.outputPricePer1M > 0;

      if (filter === "free" && model.access !== "free") return false;
      if (filter === "priced" && !priced) return false;
      if (filter === "unpriced" && (model.access === "free" || priced)) {
        return false;
      }
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle)
      );
    });
  }, [catalog, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function draftFor(model: AdminModelSummary): PriceDraft {
    return (
      drafts[model.id] ?? {
        input: initialPrice(model.inputPricePer1M),
        output: initialPrice(model.outputPricePer1M),
      }
    );
  }

  function updateDraft(model: AdminModelSummary, patch: Partial<PriceDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [model.id]: { ...draftFor(model), ...patch },
    }));
  }

  async function save(model: AdminModelSummary) {
    const draft = draftFor(model);
    const input = parseDraftPrice(draft.input);
    const output = parseDraftPrice(draft.output);

    if (input === null || output === null) {
      setError("Prices must be non-negative numbers.");

      return;
    }

    setSavingId(model.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          inputPricePer1M: input,
          outputPricePer1M: output,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.error || `Price update failed (HTTP ${response.status})`,
        );
      }

      setNotice(
        `${model.name} is now ${formatPricePer1M(input)} in / ${formatPricePer1M(output)} out per 1M.`,
      );
      setDrafts((previous) => {
        const next = { ...previous };

        delete next[model.id];

        return next;
      });
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update the price.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Price math</Card.Title>
            <Card.Description>
              Sell price is what the gateway charges. Margin and blended profit
              recalculate as you type; saving is one explicit PATCH.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {catalog.length} catalogued
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            aria-label="Search priced models"
            className="w-full"
            placeholder="Search model, id, or provider"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filter === item.key ? "primary" : "secondary"}
                onPress={() => {
                  setFilter(item.key);
                  setPage(1);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            {notice}
          </p>
        ) : null}

        {catalog.length === 0 ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-muted">
            The catalog is empty. Sync the provider first.
          </p>
        ) : (
          <div className="scroll-shell max-h-[40rem]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Access</th>
                  <th className="text-right">Cost in / out</th>
                  <th className="text-right">Sell in / out</th>
                  <th className="text-right">Margin</th>
                  <th className="text-right">Profit / 1M+1M</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((model) => (
                  <PricingRow
                    key={model.id}
                    dirty={Boolean(drafts[model.id])}
                    draft={draftFor(model)}
                    model={model}
                    saving={savingId === model.id}
                    onChange={(patch) => updateDraft(model, patch)}
                    onSave={() => save(model)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 && catalog.length > 0 ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-muted">
            No models match this filter.
          </p>
        ) : null}

        <Pagination
          page={currentPage}
          pageCount={pageCount}
          total={filtered.length}
          onChange={setPage}
        />
      </Card.Content>
    </Card>
  );
}
