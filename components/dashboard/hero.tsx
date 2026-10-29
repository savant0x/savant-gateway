"use client";

import type { ProviderStatus } from "@/lib/types";

import { Button, Chip, Spinner } from "@heroui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatDate } from "./format";

export function Hero({ provider }: { provider: ProviderStatus }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const providerReady =
    provider.configured && provider.status !== "unconfigured";

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
    <section className="hero-glow -mx-4 overflow-hidden rounded-3xl border border-black/10 px-5 py-8 sm:mx-0 sm:px-8 dark:border-white/10">
      <div className="max-w-3xl">
        <div className="flex flex-wrap gap-2">
          <Chip color="accent" size="sm" variant="soft">
            Next.js 16
          </Chip>
          <Chip color="accent" size="sm" variant="soft">
            HeroUI v3
          </Chip>
          <Chip color="default" size="sm" variant="soft">
            SQLite
          </Chip>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          A thin gateway, built clean.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          One provider integration, hashed consumer keys, free-model routing,
          and usage metering. No payment stubs, no hidden admin surface.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button isDisabled={syncing} variant="primary" onPress={handleSync}>
          {syncing ? <Spinner size="sm" /> : null}
          {syncing ? "Syncing" : "Sync provider"}
        </Button>
        <Button
          variant="secondary"
          onPress={() =>
            document
              .getElementById("keys")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Create a consumer key
        </Button>
        <span className="text-xs text-muted">
          {providerReady
            ? `Synced ${formatDate(provider.syncedAt)}`
            : "Add PROVIDER_KEY to .env.local, then sync."}
        </span>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
