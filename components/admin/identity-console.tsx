"use client";

import type { IdentityEstimate, IdentityRunMode } from "@/lib/identity/types";

import { Button, Card, Spinner } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMicros, formatNumber } from "@/components/dashboard/format";

type ModelOption = {
  id: string;
  name: string;
  family: string;
  providerLabel: string;
};

type Caps = {
  enabled: boolean;
  rpm: number;
  maxRequestsPerModel: number;
  maxRequestsPerBatch: number;
};

type CreateResponse = {
  error?: string;
  dryRun?: boolean;
  estimate?: IdentityEstimate;
  estimates?: IdentityEstimate[];
  runs?: Array<{ id: string; modelId: string }>;
};

function EstimateSummary({ estimate }: { estimate: IdentityEstimate }) {
  return (
    <div className="grid gap-3 rounded-xl border border-black/10 p-3 text-xs dark:border-white/10 sm:grid-cols-2 lg:grid-cols-4">
      <p>
        Requests:{" "}
        <span className="text-foreground">
          {formatNumber(estimate.requests)}
        </span>
      </p>
      <p>
        Prompt tokens:{" "}
        <span className="text-foreground">
          {formatNumber(estimate.promptTokens)}
        </span>
      </p>
      <p>
        Completion tokens:{" "}
        <span className="text-foreground">
          {formatNumber(estimate.completionTokens)}
        </span>
      </p>
      <p>
        Weighted tokens:{" "}
        <span className="text-foreground">
          {formatNumber(estimate.weightedTokens)}
        </span>
      </p>
      <p>
        Estimated upstream cost:{" "}
        <span className="text-foreground">
          {formatMicros(estimate.costMicros)}
        </span>
      </p>
      <p>
        Estimated time:{" "}
        <span className="text-foreground">{estimate.minutes} min</span> ·{" "}
        {estimate.effectiveMode === "verify" ? "verify" : "baseline"} mode
      </p>
      <p>
        Quota:{" "}
        <span className="text-foreground">
          {estimate.quotaRemaining === null
            ? "not reported by the provider"
            : `${formatNumber(estimate.quotaRemaining)} weighted tokens`}
        </span>
      </p>
      <p>
        Cost is an estimate, not a charge. The upstream free quota pays for it.
      </p>
    </div>
  );
}

export function IdentityConsole({
  models,
  caps,
}: {
  models: ModelOption[];
  caps: Caps;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<IdentityRunMode>("baseline");
  const [estimate, setEstimate] = useState<IdentityEstimate | null>(null);
  const [created, setCreated] = useState<
    Array<{ id: string; modelId: string }>
  >([]);
  const [busy, setBusy] = useState<"estimate" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
    setEstimate(null);
    setCreated([]);
    setNotice(null);
  }

  async function submit(dryRun: boolean) {
    if (!caps.enabled) {
      setError(
        "Identity verification is disabled. Set IDENTITY_ENABLED=true and restart the server.",
      );

      return;
    }

    if (selected.length === 0) {
      setError("Select at least one free-pool model.");

      return;
    }

    setBusy(dryRun ? "estimate" : "create");
    setError(null);
    setNotice(null);
    setCreated([]);

    try {
      const response = await fetch("/api/admin/identity/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelIds: selected, mode, dryRun }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as CreateResponse;

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? `Request failed (HTTP ${response.status})`,
        );
      }

      if (payload.estimate) setEstimate(payload.estimate);

      if (dryRun) {
        setNotice("Estimate only; no run was created.");

        return;
      }

      const runs = payload.runs ?? [];

      setCreated(runs);
      setNotice(
        runs.length === 1
          ? "Run created. It is executing in the background."
          : `${runs.length} runs created. They execute sequentially in the background.`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create the run.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>New run</Card.Title>
        <Card.Description>
          A baseline run collects the fingerprint reference. A verify run
          compares against a stored protocol-matched reference and adds a
          different-model control when one is available. A verify request with
          no reference falls back to a baseline and is priced that way.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        {!caps.enabled ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            The runner is off. Set <code>IDENTITY_ENABLED=true</code> to create
            or start runs.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Mode</span>
          {(["baseline", "verify"] as const).map((value) => (
            <Button
              key={value}
              aria-pressed={mode === value}
              size="sm"
              variant={mode === value ? "primary" : "secondary"}
              onPress={() => {
                setMode(value);
                setEstimate(null);
              }}
            >
              {value}
            </Button>
          ))}
          <span className="ml-2 text-muted">
            {selected.length} of {models.length} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setSelected(models.map((model) => model.id))}
          >
            Select all
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setSelected([])}>
            Clear
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {models.length === 0 ? (
            <p className="text-sm text-muted">
              No eligible free-pool model is available.
            </p>
          ) : (
            models.map((model) => {
              const inputId = `identity-target-${model.id.replace(
                /[^a-zA-Z0-9_-]/g,
                "-",
              )}`;

              return (
                <div
                  key={model.id}
                  className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                >
                  <input
                    checked={selected.includes(model.id)}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    id={inputId}
                    type="checkbox"
                    onChange={() => toggle(model.id)}
                  />
                  <label htmlFor={inputId}>
                    <span className="block font-medium">{model.name}</span>
                    <span className="block text-[11px] text-muted">
                      {model.id} · {model.family} · {model.providerLabel}
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            isDisabled={busy !== null || !caps.enabled || selected.length === 0}
            variant="secondary"
            onPress={() => void submit(true)}
          >
            {busy === "estimate" ? <Spinner size="sm" /> : null}
            Estimate
          </Button>
          <Button
            isDisabled={busy !== null || !caps.enabled || selected.length === 0}
            variant="primary"
            onPress={() => void submit(false)}
          >
            {busy === "create" ? <Spinner size="sm" /> : null}
            Create run
          </Button>
          <span className="text-[11px] text-muted">
            Caps: {caps.maxRequestsPerModel} requests per model,{" "}
            {caps.maxRequestsPerBatch} per batch, {caps.rpm} RPM.
          </span>
        </div>

        {estimate ? <EstimateSummary estimate={estimate} /> : null}

        {estimate && estimate.refusals.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {estimate.refusals.map((refusal, index) => (
              <li key={`${refusal}-${index}`}>{refusal}</li>
            ))}
          </ul>
        ) : null}

        {created.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {created.map((run) => (
              <li key={run.id}>
                <Link
                  className="text-accent hover:underline"
                  href={`/admin/identity/${run.id}`}
                >
                  {run.modelId}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

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
      </Card.Content>
    </Card>
  );
}
