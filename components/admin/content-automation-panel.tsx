"use client";

import type {
  AutomationHealth,
  ContentAutomationPolicy,
} from "@/lib/content/automation";
import type { FetchRun } from "@/lib/content/types";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { contentDate } from "@/lib/content/format";

function healthTone(state: AutomationHealth["state"]): string {
  if (state === "healthy") return "bg-success/10 text-success";
  if (state === "paused" || state === "awaiting_first_heartbeat")
    return "bg-black/5 text-muted dark:bg-white/10";
  if (state === "running") return "bg-accent/10 text-accent";

  return "bg-danger/10 text-danger";
}

export function ContentAutomationPanel({
  policy,
  health,
  lastRun,
  dueCount,
  lastSuccessAt,
  secretConfigured,
  policyError,
}: {
  policy: ContentAutomationPolicy;
  health: AutomationHealth;
  lastRun: FetchRun | null;
  dueCount: number;
  lastSuccessAt: string | null;
  secretConfigured: boolean;
  policyError: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy.enabled);
  const [batchLimit, setBatchLimit] = useState(String(policy.batchLimit));
  const [heartbeatMinutes, setHeartbeatMinutes] = useState(
    String(policy.heartbeatMinutes),
  );
  const [revision, setRevision] = useState(policy.revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/content/automation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          batchLimit: Number(batchLimit),
          heartbeatMinutes: Number(heartbeatMinutes),
          expectedRevision: revision,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        policy?: ContentAutomationPolicy;
      };

      if (!response.ok || !body.policy) {
        throw new Error(body.error ?? "The policy was not saved.");
      }

      setRevision(body.policy.revision);
      setMessage("Policy saved. The next heartbeat uses this revision.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Automation heartbeat</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            The saved policy is durable database state. A checked box does not
            prove a scheduler exists; health comes from the last authenticated
            run. GET and POST share the same endpoint and either{" "}
            <code className="mono">CONTENT_CRON_SECRET</code> or{" "}
            <code className="mono">CRON_SECRET</code> is accepted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${healthTone(health.state)}`}
          >
            {health.label}
          </span>
          <Link
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            href="/admin/content/history"
          >
            Run history
          </Link>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted">{health.detail}</p>

      {policyError ? (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {policyError}
        </p>
      ) : null}

      {!secretConfigured ? (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          No cron secret is configured. Every heartbeat is refused until the
          operator provisions one.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <input
            checked={enabled}
            className="mt-0.5"
            id="automation-enabled"
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>
            <label className="block font-medium" htmlFor="automation-enabled">
              Admit automatic work
            </label>
            <span className="mt-0.5 block text-muted">
              Off records paused heartbeats and starts no source work.
            </span>
          </span>
        </div>
        <label className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <span className="block font-medium">Sources per heartbeat</span>
          <input
            className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
            max={50}
            min={1}
            type="number"
            value={batchLimit}
            onChange={(event) => setBatchLimit(event.target.value)}
          />
        </label>
        <label className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <span className="block font-medium">Expected heartbeat (min)</span>
          <input
            className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
            max={60}
            min={1}
            type="number"
            value={heartbeatMinutes}
            onChange={(event) => setHeartbeatMinutes(event.target.value)}
          />
        </label>
        <div className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <p className="font-medium">Durable state</p>
          <p className="mt-1 text-muted">
            Revision {revision} · {dueCount} due now
          </p>
          <p className="mt-0.5 text-muted">
            Last success: {lastSuccessAt ? contentDate(lastSuccessAt) : "never"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={busy}
          type="button"
          onClick={save}
        >
          {busy ? "Saving…" : "Save policy"}
        </button>
        <span aria-live="polite" className="text-xs text-muted">
          {message}
        </span>
      </div>

      <div className="mt-4 rounded-lg bg-black/[0.02] px-3 py-2 text-xs dark:bg-white/[0.03]">
        <p className="font-medium">Last authenticated run</p>
        {lastRun ? (
          <p className="mt-1 text-muted">
            {[
              lastRun.status,
              lastRun.trigger,
              `started ${contentDate(lastRun.startedAt)}`,
              `claimed ${lastRun.sourcesClaimed}`,
              `stored ${lastRun.sourcesOk}`,
              `failed ${lastRun.sourcesFailed}`,
              `skipped ${lastRun.sourcesSkipped}`,
            ].join(" · ")}
          </p>
        ) : (
          <p className="mt-1 text-muted">
            No heartbeat has reached this endpoint yet.
          </p>
        )}
      </div>
    </section>
  );
}
