"use client";

import type { ContextBanner } from "@/lib/context-banner";

import { Button, Card, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminLoginHref } from "@/lib/admin-return";

export function GatewaySettings({
  banner,
  bannerMaxChars,
}: {
  banner: ContextBanner;
  bannerMaxChars: number;
}) {
  const router = useRouter();
  const [bannerEnabled, setBannerEnabled] = useState(banner.enabled);
  const [bannerText, setBannerText] = useState(banner.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveBanner() {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banner: { enabled: bannerEnabled, text: bannerText },
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (response.status === 401) {
        router.replace(
          adminLoginHref(
            `${window.location.pathname}${window.location.search}`,
          ),
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          result?.error || `Update failed (HTTP ${response.status})`,
        );
      }

      setNotice(
        bannerEnabled
          ? "Context banner saved and active on the next request."
          : "Context banner saved; injection is off.",
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save the update.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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
          <Button isDisabled={saving} variant="primary" onPress={saveBanner}>
            {saving ? <Spinner size="sm" /> : null}
            {saving ? "Saving" : "Save banner"}
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
