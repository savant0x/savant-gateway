"use client";

import type { BenchmarkStatus } from "@/lib/types";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LocalTime } from "@/components/local-time";

type Outcome = {
  status?: string;
  error?: string;
  matched?: number;
  candidates?: number;
  quotaRemaining?: number | null;
};

function describe(outcome: Outcome) {
  switch (outcome.status) {
    case "ok":
      return `Measured ${outcome.matched ?? 0} rows from ${
        outcome.candidates ?? 0
      } records. ${
        outcome.quotaRemaining === null || outcome.quotaRemaining === undefined
          ? ""
          : `${outcome.quotaRemaining} requests left in the window.`
      }`.trim();
    case "fresh":
      return "Skipped: the stored data is newer than the refresh floor.";
    case "busy":
      return "A sync is already running.";
    case "quota_exhausted":
      return "The daily request window is spent; the next window refreshes it.";
    case "disabled":
      return "No ARTIFICIAL_ANALYSIS_API_KEY is configured on this server.";
    default:
      throw new Error(outcome.error || "The sync failed.");
  }
}

export function BenchmarkPanel({ status }: { status: BenchmarkStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as Outcome | null;

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            `Benchmark refresh failed (HTTP ${response.status})`,
        );
      }

      setNotice(describe(payload ?? {}));
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not refresh the benchmark data.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Benchmarks</Card.Title>
            <Card.Description>
              Quality, output speed and time to first token come from Artificial
              Analysis and live in this database. The catalog reads the stored
              rows, so a slow or exhausted source never delays a page.
            </Card.Description>
          </div>
          <Chip
            color={status.configured ? "success" : "default"}
            size="sm"
            variant="soft"
          >
            {status.configured ? "key configured" : "no key"}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-3">
        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Last successful sync</dt>
            <dd className="mono mt-0.5">
              {status.syncedAt ? (
                <LocalTime value={status.syncedAt} />
              ) : (
                "never"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Coverage</dt>
            <dd className="mono mt-0.5">
              {status.matched} of {status.total} rows
            </dd>
          </div>
          <div>
            <dt className="text-muted">Index version</dt>
            <dd className="mono mt-0.5">
              {status.indexVersion ? `v${status.indexVersion}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Requests left in window</dt>
            <dd className="mono mt-0.5">{status.quotaRemaining ?? "—"}</dd>
          </div>
        </dl>

        {status.lastError ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            Last attempt failed: {status.lastError}
          </p>
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

        <div className="flex flex-wrap items-center gap-3">
          <Button
            isDisabled={busy || !status.configured}
            variant="primary"
            onPress={refresh}
          >
            {busy ? <Spinner size="sm" /> : null}
            {busy ? "Refreshing" : "Refresh benchmarks"}
          </Button>
          <p className="text-xs text-muted">
            {status.running
              ? "A sync is running right now."
              : "One run costs about two requests of the daily hundred."}
          </p>
        </div>
      </Card.Content>
    </Card>
  );
}
