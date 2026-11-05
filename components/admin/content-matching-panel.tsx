"use client";

import type { ContentMatchingPolicy } from "@/lib/content/matching-policy";
import type { RematchRun } from "@/lib/content/store/rematch";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  formatAliasLines,
  parseAliasLines,
} from "@/lib/content/matching-policy";

const INPUT =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10";
const BUTTON =
  "rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50";

export function ContentMatchingPanel({
  policy,
  policyError,
  run,
}: {
  policy: ContentMatchingPolicy;
  policyError: string | null;
  run: RematchRun | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy.enabled);
  const [autoPublish, setAutoPublish] = useState(policy.autoPublish);
  const [aliasText, setAliasText] = useState(formatAliasLines(policy.aliases));
  const [busy, setBusy] = useState<"save" | "run" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setMessage(null);

    try {
      const aliases = parseAliasLines(aliasText);
      const response = await fetch("/api/admin/content/matching", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: policy.revision,
          enabled,
          autoPublish,
          aliases,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        policy?: ContentMatchingPolicy;
      };

      if (!response.ok) throw new Error(body.error ?? "Save failed.");

      setMessage(
        `Policy saved at revision ${body.policy?.revision ?? policy.revision + 1}. A stored-content rematch is queued.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!run) return;

    setBusy("cancel");
    setMessage(null);

    try {
      const response = await fetch("/api/admin/content/rematch", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", runId: run.id }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) throw new Error(body.error ?? "Cancel failed.");

      setMessage("Rematch cancelled; completed work and decisions were kept.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function rematch() {
    setBusy("run");
    setMessage(null);

    try {
      const response = await fetch("/api/admin/content/rematch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const body = (await response.json()) as {
        error?: string;
        run?: RematchRun;
      };

      if (!response.ok) throw new Error(body.error ?? "Rematch failed.");

      setMessage(
        body.run
          ? `Rematch ${body.run.status}: ${body.run.processed} item(s) processed, ${body.run.changed} association change(s).`
          : "Rematch finished.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Matching policy</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
            New detections default to review-required. Automatic publication is
            an explicit policy choice. Custom aliases must still be exact,
            contiguous phrases; they do not require a version token. A policy or
            catalog change queues a bounded rematch over stored content, not a
            publisher fetch.
          </p>
        </div>
        <span className="text-[11px] text-muted">
          revision {policy.revision}
        </span>
      </div>

      {policyError ? (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          The stored policy is invalid; safe defaults are active. {policyError}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <label className="text-xs text-muted">
          Custom aliases, one per line as{" "}
          <code>model.id = phrase | phrase</code>
          <textarea
            className={`${INPUT} mt-1 min-h-32 font-mono text-xs`}
            placeholder="free/gpt-6-luna = Luna Prime | Luna-6"
            spellCheck={false}
            value={aliasText}
            onChange={(event) => setAliasText(event.target.value)}
          />
        </label>

        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
            <input
              checked={enabled}
              className="mt-0.5"
              type="checkbox"
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>
              Matching enabled
              <span className="mt-1 block text-muted">
                Off pauses detection and rematch. Source fetching and existing
                accepted or dismissed decisions continue unchanged.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10">
            <input
              checked={autoPublish}
              className="mt-0.5"
              type="checkbox"
              onChange={(event) => setAutoPublish(event.target.checked)}
            />
            <span>
              Publish new detections automatically
              <span className="mt-1 block text-muted">
                Off is the default. Accepted and dismissed decisions survive
                either setting.
              </span>
            </span>
          </label>

          <button
            className={BUTTON}
            disabled={busy !== null}
            type="button"
            onClick={save}
          >
            {busy === "save" ? "Saving…" : "Save policy"}
          </button>
          <button
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-white/10"
            disabled={busy !== null}
            type="button"
            onClick={rematch}
          >
            {busy === "run" ? "Running…" : "Run rematch batch (50)"}
          </button>
          {run?.status === "paused" || run?.status === "running" ? (
            <button
              className="w-full rounded-lg border border-danger/30 px-3 py-2 text-xs font-medium text-danger disabled:opacity-50"
              disabled={busy !== null}
              type="button"
              onClick={cancel}
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel rematch"}
            </button>
          ) : null}

          {run ? (
            <div className="rounded-lg bg-black/[0.02] px-3 py-2 text-[11px] text-muted dark:bg-white/[0.03]">
              <p>
                Last rematch:{" "}
                <span
                  className={
                    run.status === "failed" ? "text-danger" : "text-foreground"
                  }
                >
                  {run.status}
                </span>{" "}
                · {run.processed} processed · {run.changed} changed
              </p>
              <p className="mt-1">
                Cursor: {run.cursorItemId ?? "start"} · {run.trigger}
              </p>
              {run.error ? (
                <p className="mt-1 text-danger">{run.error}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-muted">No rematch has run yet.</p>
          )}

          {message ? (
            <p className="text-[11px] leading-5 text-muted" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
