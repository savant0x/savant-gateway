"use client";

import type { AdminModelSummary, ModelGroupSummary } from "@/lib/types";

import { Button, Card, Chip, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ModelBulkActions } from "@/components/admin/model-bulk-actions";
import { MODEL_ROW_SCENARIO, ModelRow } from "@/components/admin/model-row";
import { Pagination } from "@/components/ui/pagination";
import { adminLoginHref } from "@/lib/admin-return";
import { publisherFromModelId } from "@/lib/model-identity";

type Filter =
  | "all"
  | "active"
  | "disabled"
  | "free"
  | "paid"
  | "unpriced"
  | "delisted"
  | "published";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "disabled", label: "Disabled" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "unpriced", label: "Unpriced" },
  { key: "published", label: "Published" },
  { key: "delisted", label: "Delisted" },
];

export function AdminModelsTable({
  models,
  groups,
  pageSize = 20,
}: {
  models: AdminModelSummary[];
  groups: ModelGroupSummary[];
  pageSize?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return models.filter((model) => {
      const publisher = publisherFromModelId(
        model.upstreamId,
        model.upstreamSlug,
      );

      if (providerFilter !== "all" && model.upstreamSlug !== providerFilter) {
        return false;
      }
      if (publisherFilter !== "all" && publisher !== publisherFilter) {
        return false;
      }
      if (filter === "published" && !model.isPrimary) return false;
      if (filter === "active" && model.status !== "active") return false;
      if (filter === "disabled" && model.status !== "disabled") return false;
      if (filter === "free" && model.access !== "free") return false;
      if (filter === "paid" && model.access !== "paid") return false;
      if (filter === "delisted" && model.inCatalog) return false;
      if (
        filter === "unpriced" &&
        (model.access === "free" ||
          model.inputPricePer1M > 0 ||
          model.outputPricePer1M > 0)
      ) {
        return false;
      }
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.family.toLowerCase().includes(needle) ||
        model.upstreamSlug.toLowerCase().includes(needle) ||
        (publisher ?? "").toLowerCase().includes(needle)
      );
    });
  }, [filter, models, providerFilter, publisherFilter, query]);

  const providers = useMemo(
    () => Array.from(new Set(models.map((model) => model.upstreamSlug))).sort(),
    [models],
  );

  // Publisher chips are scoped to the selected account: a single-publisher
  // provider contributes nothing, and a marketplace contributes its prefixes
  // (`cc`, `cb`, `zai`) instead of one indistinguishable account name.
  const publishers = useMemo(() => {
    const found = new Set<string>();

    for (const model of models) {
      if (providerFilter !== "all" && model.upstreamSlug !== providerFilter) {
        continue;
      }

      const publisher = publisherFromModelId(
        model.upstreamId,
        model.upstreamSlug,
      );

      if (publisher) found.add(publisher);
    }

    return Array.from(found).sort();
  }, [models, providerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function toggle(model: AdminModelSummary) {
    const next = model.status === "active" ? "disabled" : "active";

    setBusyId(model.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, status: next }),
      });

      if (response.status === 401) {
        router.replace(
          adminLoginHref(
            `${window.location.pathname}${window.location.search}`,
          ),
        );

        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || `Update failed (HTTP ${response.status})`,
        );
      }

      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update the model.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function applyFilter(next: () => void) {
    next();
    setPage(1);
    setSelected([]);
  }

  function selectOne(id: string, on: boolean) {
    setSelected((previous) =>
      on
        ? Array.from(new Set([...previous, id]))
        : previous.filter((value) => value !== id),
    );
  }

  const pageIds = rows.map((model) => model.id);
  const pageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Catalog controls</Card.Title>
            <Card.Description>
              Disabled models leave the public catalog and the gateway. Select
              rows to switch several at once — the bulk action applies the same
              rules as the single button, so a row that needs a chat decision or
              a cost stays off and is reported. A model a marketplace sells from
              several publishers is one published row and N competing offers, so
              each row names its publisher and only the elected row is marked
              published. A delisted row vanished from one provider but keeps its
              prices and history. Margin and profit use the serving route&apos;s
              cost and a labelled 1M in + 1M out scenario; they are not realized
              revenue.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {filtered.length} of {models.length}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Search models"
            className="w-full"
            placeholder="Search id, name, or family"
            value={query}
            onChange={(event) =>
              applyFilter(() => setQuery(event.target.value))
            }
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={providerFilter === "all" ? "primary" : "secondary"}
              onPress={() =>
                applyFilter(() => {
                  setProviderFilter("all");
                  setPublisherFilter("all");
                })
              }
            >
              All providers
            </Button>
            {providers.map((provider) => (
              <Button
                key={provider}
                size="sm"
                variant={providerFilter === provider ? "primary" : "secondary"}
                onPress={() =>
                  applyFilter(() => {
                    setProviderFilter(provider);
                    setPublisherFilter("all");
                  })
                }
              >
                {provider}
              </Button>
            ))}
          </div>
          {publishers.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={publisherFilter === "all" ? "primary" : "secondary"}
                onPress={() => applyFilter(() => setPublisherFilter("all"))}
              >
                All publishers
              </Button>
              {publishers.map((publisher) => (
                <Button
                  key={publisher}
                  size="sm"
                  variant={
                    publisherFilter === publisher ? "primary" : "secondary"
                  }
                  onPress={() =>
                    applyFilter(() => setPublisherFilter(publisher))
                  }
                >
                  {publisher}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filter === item.key ? "primary" : "secondary"}
                onPress={() => applyFilter(() => setFilter(item.key))}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <ModelBulkActions
            matching={filtered.length}
            selected={selected}
            onClear={() => setSelected([])}
            onSelectMatching={() => setSelected(filtered.map((row) => row.id))}
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        {models.length === 0 ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-muted">
            No models yet. Sync the provider to import the catalog.
          </p>
        ) : (
          <div className="scroll-shell max-h-[36rem]">
            <table className="data-table">
              <caption className="sr-only">
                Catalog rows with upstream cost, customer sell price, and the
                resulting margin for {MODEL_ROW_SCENARIO}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      aria-label="Select this page"
                      checked={pageSelected}
                      className="size-4 accent-current"
                      type="checkbox"
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? Array.from(new Set([...previous, ...pageIds]))
                            : previous.filter((id) => !pageIds.includes(id)),
                        )
                      }
                    />
                  </th>
                  <th scope="col">Model</th>
                  <th scope="col">Provider / publisher</th>
                  <th scope="col">Family</th>
                  <th scope="col">Group</th>
                  <th scope="col">Status</th>
                  <th className="text-right" scope="col">
                    Sell / 1M
                  </th>
                  <th className="text-right" scope="col">
                    Cost / 1M
                  </th>
                  <th className="text-right" scope="col">
                    Margin / profit
                  </th>
                  <th scope="col">Context</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((model) => (
                  <ModelRow
                    key={model.id}
                    busy={busyId === model.id}
                    groups={groups}
                    model={model}
                    selected={selected.includes(model.id)}
                    onSelect={(on) => selectOne(model.id, on)}
                    onToggle={() => toggle(model)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 && models.length > 0 ? (
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
