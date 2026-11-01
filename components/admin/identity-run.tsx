"use client";

import type {
  IdentityRunStatus,
  IdentityVerdictStatus,
} from "@/lib/identity/types";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { responseError } from "@/components/dashboard/format";

type Action = "start" | "publish" | "unpublish" | "cancel" | "confirm_mismatch";

export function IdentityRun({
  runId,
  status,
  verdictStatus,
  published,
}: {
  runId: string;
  status: IdentityRunStatus;
  verdictStatus: IdentityVerdictStatus | null;
  published: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const polling = status === "queued" || status === "running";

  useEffect(() => {
    if (!polling) return;

    const timer = setInterval(() => router.refresh(), 5_000);

    return () => clearInterval(timer);
  }, [polling, router]);

  async function act(action: Action) {
    setBusy(action);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/identity/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) throw new Error(await responseError(response));

      setNotice(
        action === "start"
          ? "Run started. This page refreshes while it executes."
          : action === "cancel"
            ? "Cancellation requested; the runner stops between probes."
            : action === "publish"
              ? "Verdict published to the public model page."
              : action === "unpublish"
                ? "Verdict unpublished and a correction row was written."
                : "Mismatch confirmed and a correction row was written. Publication is separate.",
      );
      setNote("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  const canStart = status === "queued";
  const canCancel = status === "queued" || status === "running";
  const canPublish =
    status === "completed" && verdictStatus !== null && !published;
  const canConfirm = verdictStatus === "divergent_review";
  const requiresNote = canConfirm || published;

  return (
    <div className="space-y-3">
      {polling ? (
        <p className="text-xs text-muted">
          This run is {status}; the page refreshes every five seconds.{" "}
          {status === "queued"
            ? "Start it if the process restarted before the claim."
            : "Cancellation is checked between probes."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canStart ? (
          <Button
            isDisabled={busy !== null}
            size="sm"
            variant="primary"
            onPress={() => void act("start")}
          >
            {busy === "start" ? <Spinner size="sm" /> : null}
            Start
          </Button>
        ) : null}

        {canPublish ? (
          <Button
            isDisabled={busy !== null}
            size="sm"
            variant="primary"
            onPress={() => void act("publish")}
          >
            {busy === "publish" ? <Spinner size="sm" /> : null}
            Publish
          </Button>
        ) : null}

        {published ? (
          <Button
            isDisabled={busy !== null || note.trim() === ""}
            size="sm"
            variant="secondary"
            onPress={() => void act("unpublish")}
          >
            {busy === "unpublish" ? <Spinner size="sm" /> : null}
            Unpublish
          </Button>
        ) : null}

        {canConfirm ? (
          <Button
            isDisabled={busy !== null || note.trim() === ""}
            size="sm"
            variant="secondary"
            onPress={() => void act("confirm_mismatch")}
          >
            {busy === "confirm_mismatch" ? <Spinner size="sm" /> : null}
            Confirm mismatch
          </Button>
        ) : null}

        {canCancel ? (
          <Button
            isDisabled={busy !== null}
            size="sm"
            variant="secondary"
            onPress={() => void act("cancel")}
          >
            {busy === "cancel" ? <Spinner size="sm" /> : null}
            Cancel
          </Button>
        ) : null}

        {!canStart && !canCancel && !canPublish && !canConfirm && !published ? (
          <p className="text-xs text-muted">
            No action is available in this state.
          </p>
        ) : null}
      </div>

      <label className="block text-xs text-muted">
        Correction note
        <textarea
          aria-label="Correction note"
          className="mt-1 min-h-20 w-full rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent dark:border-white/10"
          placeholder={
            requiresNote
              ? "Required: why this result is being changed or confirmed."
              : "Optional on publish; stored in the correction ledger."
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

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
    </div>
  );
}
