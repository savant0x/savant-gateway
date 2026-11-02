"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const RELATIONS = [
  "release",
  "benchmark",
  "hands_on",
  "discussion",
  "repository",
  "paper",
  "mention",
] as const;

const INPUT =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10";

export function ContentLinkForm({
  items,
  models,
}: {
  items: Array<{ id: string; title: string }>;
  models: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [relation, setRelation] =
    useState<(typeof RELATIONS)[number]>("mention");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/content/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, modelId, relation }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) throw new Error(body.error ?? "Link failed.");

      setMessage("Manual link recorded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0 || models.length === 0) {
    return (
      <p className="text-xs text-muted">
        A manual link needs at least one ingested item and one active catalog
        model.
      </p>
    );
  }

  return (
    <form
      className="grid gap-2 lg:grid-cols-[2fr_1.5fr_1fr_auto]"
      onSubmit={submit}
    >
      <select
        className={INPUT}
        value={itemId}
        onChange={(event) => setItemId(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      <select
        className={INPUT}
        value={modelId}
        onChange={(event) => setModelId(event.target.value)}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} · {model.id}
          </option>
        ))}
      </select>
      <select
        className={INPUT}
        value={relation}
        onChange={(event) =>
          setRelation(event.target.value as (typeof RELATIONS)[number])
        }
      >
        {RELATIONS.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <button
        className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        disabled={busy}
        type="submit"
      >
        {busy ? "Linking…" : "Link"}
      </button>
      {message ? (
        <p className="text-xs text-muted lg:col-span-4">{message}</p>
      ) : null}
    </form>
  );
}
