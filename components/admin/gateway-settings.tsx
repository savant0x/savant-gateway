"use client";

import type { ContextBanner } from "@/lib/context-banner";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type AllocationSummaryPayload = {
  day: string;
  enabled: boolean;
  dailyPoolTokens: number;
  allocationBps: number;
  allocatableTokens: number;
  reservedTokens: number;
  activeAccounts: number;
  allocatedTokens: number;
  usedTokens: number;
  perAccountTokens: number;
};

function formatTokens(value: number) {
  return value.toLocaleString("en-US");
}

export function GatewaySettings({
  summary,
  banner,
  bannerMaxChars,
}: {
  summary: AllocationSummaryPayload;
  banner: ContextBanner;
  bannerMaxChars: number;
}) {
  const router = useRouter();
  const [allocationEnabled, setAllocationEnabled] = useState(summary.enabled);
  const [dailyPool, setDailyPool] = useState(String(summary.dailyPoolTokens));
  const [sharePercent, setSharePercent] = useState(
    (summary.allocationBps / 100).toString(),
  );
  const [bannerEnabled, setBannerEnabled] = useState(banner.enabled);
  const [bannerText, setBannerText] = useState(banner.text);
  const [saving, setSaving] = useState<"allocation" | "banner" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(
    kind: "allocation" | "banner",
    payload: Record<string, unknown>,
    message: string,
  ) {
    setSaving(kind);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) {
        throw new Error(
          result?.error || `Update failed (HTTP ${response.status})`,
        );
      }

      setNotice(message);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save the update.",
      );
    } finally {
      setSaving(null);
    }
  }

  function saveAllocation() {
    const pool = Number(dailyPool);
    const percent = Number(sharePercent);

    if (!Number.isSafeInteger(pool) || pool < 0) {
      setError("Daily pool must be a non-negative whole number of tokens.");
      setNotice(null);

      return;
    }

    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Share must be between 0 and 100 percent.");
      setNotice(null);

      return;
    }

    void save(
      "allocation",
      {
        allocation: {
          enabled: allocationEnabled,
          dailyPoolTokens: pool,
          allocationBps: Math.round(percent * 100),
        },
      },
      `Allocation updated: ${formatTokens(Math.floor((pool * Math.round(percent * 100)) / 10_000))} tokens pool share.`,
    );
  }

  function saveBanner() {
    void save(
      "banner",
      { banner: { enabled: bannerEnabled, text: bannerText } },
      bannerEnabled
        ? "Context banner saved and active on the next request."
        : "Context banner saved; injection is off.",
    );
  }

  return (
    <div className="space-y-4">
      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Daily free-pool allocation</Card.Title>
          <Card.Description>
            The upstream free plan grants one weighted-token pool per UTC day.
            This splits a share of it evenly across activated accounts — active
            customers holding at least one active key — and holds the rest back.
            An account keeps its allocation for the day; accounts added later
            can only take what is still unallocated.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                checked={allocationEnabled}
                className="h-4 w-4 accent-[var(--accent)]"
                type="checkbox"
                onChange={(event) => setAllocationEnabled(event.target.checked)}
              />
              Shared allocation enabled
            </label>
            <span className="flex items-center gap-2 text-sm text-muted">
              Daily pool
              <Input
                aria-label="Daily pool weighted tokens"
                className="w-40"
                min={0}
                step="1"
                type="number"
                value={dailyPool}
                onChange={(event) => setDailyPool(event.target.value)}
              />
              tokens
            </span>
            <span className="flex items-center gap-2 text-sm text-muted">
              Allocated share
              <Input
                aria-label="Allocated share percent"
                className="w-24"
                max={100}
                min={0}
                step="1"
                type="number"
                value={sharePercent}
                onChange={(event) => setSharePercent(event.target.value)}
              />
              %
            </span>
          </div>

          <div className="grid gap-3 text-xs text-muted sm:grid-cols-3">
            <p>
              Allocatable today:{" "}
              <span className="text-foreground">
                {formatTokens(summary.allocatableTokens)}
              </span>
            </p>
            <p>
              Allocated:{" "}
              <span className="text-foreground">
                {formatTokens(summary.allocatedTokens)}
              </span>{" "}
              across {summary.activeAccounts} activated{" "}
              {summary.activeAccounts === 1 ? "account" : "accounts"}
            </p>
            <p>
              Used:{" "}
              <span className="text-foreground">
                {formatTokens(summary.usedTokens)}
              </span>{" "}
              · reserved{" "}
              <span className="text-foreground">
                {formatTokens(summary.reservedTokens)}
              </span>
            </p>
          </div>

          <Button
            isDisabled={saving !== null}
            variant="primary"
            onPress={saveAllocation}
          >
            {saving === "allocation" ? <Spinner size="sm" /> : null}
            {saving === "allocation" ? "Saving" : "Save allocation"}
          </Button>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Context banner</Card.Title>
          <Card.Description>
            Prepended as a system message to every upstream chat request while
            enabled. The text counts toward the call&apos;s tokens because the
            upstream bills it, and it is visible to any agent using the gateway.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              checked={bannerEnabled}
              className="h-4 w-4 accent-[var(--accent)]"
              type="checkbox"
              onChange={(event) => setBannerEnabled(event.target.checked)}
            />
            Inject into every request
          </label>
          <textarea
            aria-label="Context banner text"
            className="min-h-32 w-full rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent dark:border-white/10"
            maxLength={bannerMaxChars}
            value={bannerText}
            onChange={(event) => setBannerText(event.target.value)}
          />
          <p className="text-xs text-muted">
            {bannerText.length.toLocaleString("en-US")} /{" "}
            {bannerMaxChars.toLocaleString("en-US")} characters
          </p>
          <Button
            isDisabled={saving !== null}
            variant="primary"
            onPress={saveBanner}
          >
            {saving === "banner" ? <Spinner size="sm" /> : null}
            {saving === "banner" ? "Saving" : "Save banner"}
          </Button>
        </Card.Content>
      </Card>

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
