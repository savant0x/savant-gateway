"use client";

import type { AdminModelSummary, ModelGroupSummary } from "@/lib/types";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { GroupSelect } from "@/components/admin/group-select";
import { ModelCostEditor } from "@/components/admin/model-cost-editor";
import { StatusChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";

type Filter =
  "all" | "active" | "disabled" | "free" | "paid" | "unpriced" | "delisted";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "disabled", label: "Disabled" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "unpriced", label: "Unpriced" },
  { key: "delisted", label: "Delisted" },
];

function price(model: AdminModelSummary) {
  if (model.access === "free") return "Free";

  if (model.inputPricePer1M === 0 && model.outputPricePer1M === 0) {
    return model.access === "subscription" ? "Subscription" : "Unpriced";
  }

  return `${formatPricePer1M(model.inputPricePer1M)} / ${formatPricePer1M(model.outputPricePer1M)}`;
}

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
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return models.filter((model) => {
      if (providerFilter !== "all" && model.upstreamSlug !== providerFilter) {
        return false;
      }
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
        model.upstreamSlug.toLowerCase().includes(needle)
      );
    });
  }, [filter, models, providerFilter, query]);

  const providers = useMemo(
    () => Array.from(new Set(models.map((model) => model.upstreamSlug))).sort(),
    [models],
  );

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
        router.replace("/admin/login");

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
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Catalog controls</Card.Title>
            <Card.Description>
              Disabled models leave the public catalog and the gateway. A
              delisted row vanished from one provider but keeps its prices and
              history. Paid rows need a known upstream cost before they can be
              enabled.
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
              onPress={() => applyFilter(() => setProviderFilter("all"))}
            >
              All providers
            </Button>
            {providers.map((provider) => (
              <Button
                key={provider}
                size="sm"
                variant={providerFilter === provider ? "primary" : "secondary"}
                onPress={() => applyFilter(() => setProviderFilter(provider))}
              >
                {provider}
              </Button>
            ))}
          </div>
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
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Family</th>
                  <th>Group</th>
                  <th>Status</th>
                  <th className="text-right">Sell / 1M</th>
                  <th className="text-right">Cost / 1M</th>
                  <th>Context</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((model) => (
                  <tr key={model.id}>
                    <td className="max-w-[22rem]">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {model.name}
                        </span>
                        {!model.inCatalog ? (
                          <Chip color="warning" size="sm" variant="soft">
                            delisted
                          </Chip>
                        ) : null}
                      </div>
                      <div className="mono mt-0.5 truncate text-[11px] text-muted">
                        {model.id}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {model.upstreamSlug}
                      <p className="text-[11px]">{model.protocol}</p>
                    </td>
                    <td className="text-muted">{model.family}</td>
                    <td>
                      <GroupSelect
                        groupSlug={model.groupSlug}
                        groups={groups}
                        modelId={model.id}
                      />
                      <p className="mt-1 text-[11px] text-muted">
                        {model.access} billing · {model.groupSource}
                      </p>
                    </td>
                    <td>
                      <StatusChip status={model.status} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {price(model)}
                    </td>
                    <td className="text-right">
                      <ModelCostEditor model={model} />
                    </td>
                    <td className="text-muted">{model.contextWindow}</td>
                    <td>
                      <Button
                        isDisabled={busyId === model.id || !model.inCatalog}
                        size="sm"
                        variant={
                          model.status === "active"
                            ? "danger-soft"
                            : "secondary"
                        }
                        onPress={() => toggle(model)}
                      >
                        {busyId === model.id ? <Spinner size="sm" /> : null}
                        {model.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  </tr>
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
