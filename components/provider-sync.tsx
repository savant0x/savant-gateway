"use client";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProviderSyncButton({
  label = "Sync provider",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/provider/sync", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as {
        imported?: number;
        free?: number;
        warnings?: string[];
        error?: string;
      } | null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Provider sync needs localhost or a signed-in admin session.",
          );
        }

        throw new Error(
          payload?.error || `Provider sync failed (HTTP ${response.status})`,
        );
      }

      setNotice(
        `Synced ${payload?.imported ?? 0} models, ${payload?.free ?? 0} free.${
          payload?.warnings?.length ? ` ${payload.warnings.join(" ")}` : ""
        }`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Provider sync failed",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button isDisabled={syncing} variant="primary" onPress={handleSync}>
        {syncing ? <Spinner size="sm" /> : null}
        {syncing ? "Syncing" : label}
      </Button>
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
