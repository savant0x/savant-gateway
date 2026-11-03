"use client";

import type { ContentKind } from "@/lib/content/types";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { kindLabel } from "@/lib/content/format";
import { parseSearchQuery } from "@/lib/content/search";

type ItemResult = {
  id: string;
  title: string;
  kind: ContentKind;
  sourceLabel: string;
};

type ModelResult = {
  id: string;
  name: string;
  family: string;
};

type TopicResult = {
  slug: string;
  label: string;
  count: number;
};

type Results = {
  items: ItemResult[];
  models: ModelResult[];
  topics: TopicResult[];
};

type Group = "Items" | "Models" | "Topics";

type Entry = {
  group: Group;
  key: string;
  label: string;
  detail: string;
  href: string;
};

const EMPTY: Results = { items: [], models: [], topics: [] };

function entriesFor(results: Results): Entry[] {
  return [
    ...results.items.map((item) => ({
      group: "Items" as const,
      key: `item:${item.id}`,
      label: item.title,
      detail: `${kindLabel(item.kind)} · ${item.sourceLabel}`,
      href: `/signal/${encodeURIComponent(item.id)}`,
    })),
    ...results.models.map((model) => ({
      group: "Models" as const,
      key: `model:${model.id}`,
      label: model.name,
      detail: `${model.family} · ${model.id}`,
      href: `/models/${model.id}`,
    })),
    ...results.topics.map((topic) => ({
      group: "Topics" as const,
      key: `topic:${topic.slug}`,
      label: `#${topic.label}`,
      detail: `${topic.count} ${topic.count === 1 ? "piece" : "pieces"}`,
      href: `/signal/topics/${encodeURIComponent(topic.slug)}`,
    })),
  ];
}

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const entries = entriesFor(results);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;

      event.preventDefault();

      const dialog = dialogRef.current;

      if (!dialog) return;

      if (dialog.open) {
        dialog.close();
      } else {
        dialog.showModal();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [results]);

  useEffect(() => {
    if (!open) return;

    const parsed = parseSearchQuery(query);

    if (!parsed.ok) {
      setResults(EMPTY);
      setError(null);
      setSearching(false);

      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);

      fetch(`/api/content/search?q=${encodeURIComponent(parsed.query)}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      })
        .then(async (response) => {
          const payload = (await response.json()) as Partial<Results> & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error ?? "Search failed.");
          }

          if (cancelled) return;

          setResults({
            items: payload.items ?? [],
            models: payload.models ?? [],
            topics: payload.topics ?? [],
          });
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof Error && caught.name === "AbortError") return;

          setError(caught instanceof Error ? caught.message : "Search failed.");
          setResults(EMPTY);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function openDialog() {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) dialog.showModal();

    setOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function go(entry: Entry) {
    dialogRef.current?.close();
    setOpen(false);
    router.push(entry.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) =>
        entries.length === 0 ? 0 : (current + 1) % entries.length,
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        entries.length === 0
          ? 0
          : (current - 1 + entries.length) % entries.length,
      );

      return;
    }

    if (event.key === "Enter") {
      const entry = entries[active];

      if (entry) {
        event.preventDefault();
        go(entry);
      }
    }
  }

  function reset() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setSearching(false);
    setError(null);
  }

  const trimmed = query.trim();

  return (
    <>
      <button
        aria-keyshortcuts="Control+K Meta+K"
        className="nav-utility"
        type="button"
        onClick={openDialog}
      >
        <i aria-hidden className="fa-solid fa-magnifying-glass" />{" "}
        <span aria-hidden>Search</span>
        <span className="sr-only">Search Signal</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search Signal"
        className="w-[min(42rem,92vw)] rounded-xl border border-black/10 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 dark:border-white/10"
        onClose={reset}
      >
        <div className="border-b border-black/10 p-3 dark:border-white/10">
          <label className="sr-only" htmlFor="command-palette-input">
            Search Signal items, models, and topics
          </label>
          <input
            ref={inputRef}
            aria-activedescendant={
              entries[active] ? `command-option-${active}` : undefined
            }
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-expanded={entries.length > 0}
            autoComplete="off"
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10"
            id="command-palette-input"
            placeholder="Search items, models, topics…"
            role="combobox"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>↑↓ to move · Enter to open · Esc to close</span>
            <span>{searching ? "Searching…" : "Ctrl/Cmd+K"}</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : trimmed.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted">
              Search Signal items, models, and topics.
            </p>
          ) : trimmed.length < 2 ? (
            <p className="px-3 py-4 text-xs text-muted">
              Type at least two characters.
            </p>
          ) : entries.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted">
              {searching ? "Searching…" : `No matches for “${trimmed}”.`}
            </p>
          ) : (
            <div
              aria-label="Search results"
              id="command-palette-results"
              role="listbox"
            >
              {(["Items", "Models", "Topics"] as const).map((group) => {
                const groupEntries = entries
                  .map((entry, index) => ({ entry, index }))
                  .filter(({ entry }) => entry.group === group);

                if (groupEntries.length === 0) return null;

                return (
                  <div key={group} role="group">
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {group}
                    </p>
                    {groupEntries.map(({ entry, index }) => (
                      <button
                        key={entry.key}
                        aria-selected={index === active}
                        className={`flex w-full flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                          index === active
                            ? "bg-cyan-300/10 text-foreground"
                            : "text-foreground/90 hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                        id={`command-option-${index}`}
                        role="option"
                        type="button"
                        onClick={() => go(entry)}
                        onMouseEnter={() => setActive(index)}
                      >
                        <span className="min-w-0 truncate">{entry.label}</span>
                        <span className="text-[11px] text-muted">
                          {entry.detail}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-black/10 px-3 py-2 text-[11px] text-muted dark:border-white/10">
          <span>One search across Signal and the catalog.</span>
          <button
            className="underline-offset-4 hover:underline"
            type="button"
            onClick={closeDialog}
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
