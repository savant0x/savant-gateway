"use client";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkupForm({ markupBps }: { markupBps: number }) {
  const router = useRouter();
  const [percent, setPercent] = useState((markupBps / 100).toString());
  const [applyToAll, setApplyToAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleApply() {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const markup = Number(percent);

      if (!Number.isFinite(markup) || markup < 0 || markup > 1000) {
        throw new Error("Markup must be between 0 and 1000 percent.");
      }

      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markupBps: Math.round(markup * 100),
          applyToAll,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        changed?: number;
        error?: string;
      } | null;

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.error || `Markup update failed (HTTP ${response.status})`,
        );
      }

      setNotice(
        `Default markup is ${markup}%. ${payload?.changed ?? 0} rows repriced.`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not apply the markup.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Default markup</Card.Title>
        <Card.Description>
          Auto-priced rows follow this multiplier over upstream cost. Manual
          rows keep their operator price unless you explicitly overwrite them.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-sm text-muted">
            Markup
            <Input
              aria-label="Markup percent"
              className="w-28"
              max={1000}
              min={0}
              step="1"
              type="number"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
            />
            %
          </span>
          <Button isDisabled={saving} variant="primary" onPress={handleApply}>
            {saving ? <Spinner size="sm" /> : null}
            {saving ? "Applying" : "Apply markup"}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              checked={applyToAll}
              className="h-4 w-4 accent-[var(--accent)]"
              type="checkbox"
              onChange={(event) => setApplyToAll(event.target.checked)}
            />
            Overwrite manual prices too
          </label>
        </div>

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
