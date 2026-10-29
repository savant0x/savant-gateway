"use client";

import type { ModelSummary } from "@/lib/types";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AccessChip, StatusChip } from "@/components/dashboard/chips";

type Filter = "all" | "free" | "disabled";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "disabled", label: "Disabled" },
];

export function AdminModelsTable({ models }: { models: ModelSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return models.filter((model) => {
      if (filter === "free" && model.access !== "free") return false;
      if (filter === "disabled" && model.status !== "disabled") return false;
      if (!needle) return true;

      return (
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle)
      );
    });
  }, [filter, models, query]);

  async function toggle(model: ModelSummary) {
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

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Catalog controls</Card.Title>
            <Card.Description>
              Disabled models disappear from the public catalog and the gateway.
              The status survives a provider sync.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {filtered.length} of {models.length}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            aria-label="Search models"
            className="w-full"
            placeholder="Search id, name, or provider"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex shrink-0 gap-1">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filter === item.key ? "primary" : "secondary"}
                onPress={() => setFilter(item.key)}
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
            No models yet. Sync the provider above to import the catalog.
          </p>
        ) : (
          <div className="scroll-shell max-h-[32rem]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Weight</th>
                  <th>Context</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((model) => (
                  <tr key={model.id}>
                    <td>
                      <div className="font-medium">{model.name}</div>
                      <div className="mono mt-0.5 text-[11px] text-muted">
                        {model.id}
                      </div>
                    </td>
                    <td>
                      <AccessChip model={model} />
                    </td>
                    <td>
                      <StatusChip status={model.status} />
                    </td>
                    <td className="text-muted">
                      {model.tokenWeight > 0 ? `${model.tokenWeight}×` : "—"}
                    </td>
                    <td className="text-muted">{model.contextWindow}</td>
                    <td>
                      <Button
                        isDisabled={busyId === model.id}
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
      </Card.Content>
    </Card>
  );
}
