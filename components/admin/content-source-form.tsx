"use client";

import type { SourceKind } from "@/lib/content/types";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  HACKERNEWS_STREAM_LABELS,
  HACKERNEWS_STREAMS,
  hackerNewsStreamUrl,
  type HackerNewsStream,
} from "@/lib/content/hackernews-config";

type FormState = {
  kind: SourceKind;
  label: string;
  url: string;
  tags: string;
  channelId: string;
  includeTerms: string;
  excludeTerms: string;
  hnStream: HackerNewsStream;
  fetchIntervalMinutes: string;
  maxItems: string;
  enabled: boolean;
};

const INITIAL: FormState = {
  kind: "rss",
  label: "",
  url: "",
  tags: "",
  channelId: "",
  includeTerms: "",
  excludeTerms: "",
  hnStream: "top",
  fetchIntervalMinutes: "60",
  maxItems: "20",
  enabled: true,
};

const KIND_URLS: Record<FormState["kind"], string> = {
  rss: "",
  youtube: "",
  huggingface: "https://huggingface.co/api/daily_papers",
  trendshift: "https://trendshift.io/?sort=views",
  hackernews: hackerNewsStreamUrl("top"),
};

const KIND_HINTS: Record<FormState["kind"], string> = {
  rss: "Free RSS or Atom feed.",
  youtube: "YouTube channel; the channel feed is fetched server-side.",
  huggingface: "HuggingFace Daily Papers; the public JSON endpoint is fetched.",
  trendshift: "Trendshift listing; the public page is parsed for repos.",
  hackernews:
    "Ranked Hacker News list; a bounded window is filtered locally by AI/agent terms.",
};

const INPUT =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10";

export function ContentSourceForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/content/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          includeTerms: form.kind === "hackernews" ? form.includeTerms : "",
          excludeTerms: form.kind === "hackernews" ? form.excludeTerms : "",
        }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "The source could not be created.");
      }

      setForm(INITIAL);
      setNotice("Source created. Fetch it to populate the hub.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10"
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Add a source</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            {KIND_HINTS[form.kind]} The source URL is fetched by the server, so
            loopback and private addresses are refused. GitHub repo facts need
            GITHUB_TOKEN; without it repos still ingest, unenriched.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            checked={form.enabled}
            type="checkbox"
            onChange={(event) => update("enabled", event.target.checked)}
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Kind
          <select
            className={`${INPUT} mt-1`}
            value={form.kind}
            onChange={(event) => {
              const kind = event.target.value as FormState["kind"];

              setForm((current) => ({
                ...current,
                kind,
                url:
                  kind === "hackernews"
                    ? hackerNewsStreamUrl(current.hnStream)
                    : KIND_URLS[kind],
                channelId: kind === "youtube" ? current.channelId : "",
              }));
            }}
          >
            <option value="rss">RSS / Atom</option>
            <option value="youtube">YouTube channel</option>
            <option value="huggingface">HuggingFace Daily Papers</option>
            <option value="trendshift">Trendshift listing</option>
            <option value="hackernews">Hacker News (AI filtered)</option>
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Label
          <input
            required
            className={`${INPUT} mt-1`}
            maxLength={120}
            placeholder="OpenAI news"
            value={form.label}
            onChange={(event) => update("label", event.target.value)}
          />
        </label>
        <label className="text-xs text-muted">
          Tags
          <input
            className={`${INPUT} mt-1`}
            placeholder="openai, llm"
            value={form.tags}
            onChange={(event) => update("tags", event.target.value)}
          />
        </label>
        {form.kind === "hackernews" ? (
          <label className="text-xs text-muted sm:col-span-2 lg:col-span-3">
            Ranked stream
            <select
              className={`${INPUT} mt-1`}
              value={form.hnStream}
              onChange={(event) => {
                const hnStream = event.target.value as HackerNewsStream;

                setForm((current) => ({
                  ...current,
                  hnStream,
                  url: hackerNewsStreamUrl(hnStream),
                }));
              }}
            >
              {HACKERNEWS_STREAMS.map((stream) => (
                <option key={stream} value={stream}>
                  {HACKERNEWS_STREAM_LABELS[stream]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted">
              {form.url}
            </span>
          </label>
        ) : (
          <label className="text-xs text-muted sm:col-span-2 lg:col-span-3">
            {form.kind === "youtube"
              ? "Channel URL or channel id"
              : form.kind === "huggingface"
                ? "Daily-papers API URL"
                : form.kind === "trendshift"
                  ? "Trendshift listing URL"
                  : "Feed URL"}
            <input
              required
              className={`${INPUT} mt-1`}
              placeholder={
                form.kind === "youtube"
                  ? "https://www.youtube.com/@channel"
                  : form.kind === "huggingface"
                    ? "https://huggingface.co/api/daily_papers"
                    : form.kind === "trendshift"
                      ? "https://trendshift.io/?sort=views"
                      : "https://example.com/feed.xml"
              }
              type="url"
              value={form.url}
              onChange={(event) => update("url", event.target.value)}
            />
          </label>
        )}
        {form.kind === "hackernews" ? (
          <>
            <label className="text-xs text-muted sm:col-span-2">
              Extra include terms (optional)
              <input
                className={`${INPUT} mt-1`}
                placeholder="world model, voice cloning"
                value={form.includeTerms}
                onChange={(event) => update("includeTerms", event.target.value)}
              />
            </label>
            <label className="text-xs text-muted">
              Exclude terms (optional)
              <input
                className={`${INPUT} mt-1`}
                placeholder="hiring, sale"
                value={form.excludeTerms}
                onChange={(event) => update("excludeTerms", event.target.value)}
              />
            </label>
          </>
        ) : null}
        {form.kind === "youtube" ? (
          <label className="text-xs text-muted">
            Channel id (optional)
            <input
              className={`${INPUT} mt-1`}
              placeholder="UC…"
              value={form.channelId}
              onChange={(event) => update("channelId", event.target.value)}
            />
          </label>
        ) : null}
        <label className="text-xs text-muted">
          Interval (minutes)
          <input
            className={`${INPUT} mt-1`}
            max={1440}
            min={15}
            type="number"
            value={form.fetchIntervalMinutes}
            onChange={(event) =>
              update("fetchIntervalMinutes", event.target.value)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Items per fetch
          <input
            className={`${INPUT} mt-1`}
            max={50}
            min={1}
            type="number"
            value={form.maxItems}
            onChange={(event) => update("maxItems", event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {notice}
        </p>
      ) : null}

      <button
        className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={busy}
        type="submit"
      >
        {busy ? "Creating…" : "Create source"}
      </button>
    </form>
  );
}
