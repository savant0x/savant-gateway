/**
 * Recoverable source presets (FID-2026-1102-101).
 *
 * The retired aggroNATION site kept its rows in Supabase, so only the sources
 * committed in `register-operator-sources.ts`, four inferred canonical feeds,
 * and two YouTube handles recovered from the old local volume are available.
 * These presets make that manifest usable in one click.
 * Seeding is idempotent on the exact source URL; it never updates or deletes an
 * existing source, because an operator edit is authoritative.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { SourceInput } from "./store/sources.ts";

import { createSource, listSources } from "./store/sources.ts";

export type SourcePreset = SourceInput & { note: string };

export const CONTENT_SOURCE_PRESETS: SourcePreset[] = [
  {
    kind: "rss",
    label: "Hacker News",
    url: "https://hnrss.org/frontpage",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Exact row committed in the old repository.",
  },
  {
    kind: "rss",
    label: "Open Source Projects",
    url: "https://www.opensourceprojects.dev/rss",
    config: { tags: ["repository"] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Exact row committed in the old repository.",
  },
  {
    kind: "rss",
    label: "r/AI_Agents",
    url: "https://www.reddit.com/r/AI_Agents/hot.rss",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Exact row committed in the old repository; Reddit rate-limits.",
  },
  {
    kind: "rss",
    label: "r/singularity",
    url: "https://www.reddit.com/r/singularity/hot.rss",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Exact row committed in the old repository; Reddit rate-limits.",
  },
  {
    kind: "huggingface",
    label: "HuggingFace Daily Papers",
    url: "https://huggingface.co/api/daily_papers",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Public JSON endpoint; no key required.",
  },
  {
    kind: "hackernews",
    label: "Hacker News (AI filtered)",
    url: "https://hacker-news.firebaseio.com/v0/topstories.json",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 20,
    note: "Public v0 ranked list; only AI/agent stories pass the local filter.",
  },
  {
    kind: "trendshift",
    label: "Trendshift",
    url: "https://trendshift.io/?sort=views",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Public listing parsed as HTML; no key required.",
  },
  {
    kind: "youtube",
    label: "@airevolutionx",
    url: "https://www.youtube.com/@airevolutionx",
    config: { tags: [], channelId: "@airevolutionx" },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Handle recovered from the old local volume; the label was not stored.",
  },
  {
    kind: "youtube",
    label: "@savant",
    url: "https://www.youtube.com/@savant",
    config: { tags: [], channelId: "@savant" },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Handle recovered from the old local volume; the label was not stored.",
  },
  {
    kind: "rss",
    label: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Canonical feed inferred from the old source badge; URL was not committed.",
  },
  {
    kind: "rss",
    label: "HF Blog",
    url: "https://huggingface.co/blog/feed.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Canonical feed inferred from the old source badge; URL was not committed.",
  },
  {
    kind: "rss",
    label: "arXiv cs.AI",
    url: "https://rss.arxiv.org/rss/cs.AI",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Canonical feed inferred from the old source badge; use the rss.arxiv.org host.",
  },
  {
    kind: "rss",
    label: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Canonical feed inferred from the old source badge; URL was not committed.",
  },
];

export type SeedResult = {
  created: string[];
  skipped: string[];
};

/** Adds only missing presets. An existing URL is never modified. */
export async function seedContentSources(
  db: PostgresDatabase,
): Promise<SeedResult> {
  const existing = new Set((await listSources(db)).map((source) => source.url));
  const created: string[] = [];
  const skipped: string[] = [];

  for (const preset of CONTENT_SOURCE_PRESETS) {
    const url = new URL(preset.url).toString();

    if (existing.has(url)) {
      skipped.push(preset.label);
      continue;
    }

    await createSource(db, {
      kind: preset.kind,
      label: preset.label,
      url,
      config: preset.config,
      enabled: preset.enabled,
      fetchIntervalMinutes: preset.fetchIntervalMinutes,
      maxItems: preset.maxItems,
    });
    existing.add(url);
    created.push(preset.label);
  }

  return { created, skipped };
}
