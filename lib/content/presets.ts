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
  {
    kind: "rss",
    label: "Lobsters",
    url: "https://lobste.rs/rss",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified RSS 2.0 on 2026-11-03; technical discussion complement to Hacker News.",
  },
  {
    kind: "rss",
    label: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified Atom feed on 2026-11-03; high-signal AI commentary.",
  },
  {
    kind: "rss",
    label: "Latent Space",
    url: "https://www.latent.space/feed",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified RSS 2.0 on 2026-11-03; the feed is about 1.3 MB per full fetch.",
  },
  {
    kind: "rss",
    label: "Import AI",
    url: "https://importai.substack.com/feed",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified RSS feed on 2026-11-03; weekly research digest.",
  },
  {
    kind: "rss",
    label: "arXiv cs.LG",
    url: "https://rss.arxiv.org/rss/cs.LG",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified RSS 2.0 on 2026-11-03; about 1.9 MB per full fetch, near the 2 MiB ceiling.",
  },
  {
    kind: "rss",
    label: "arXiv cs.CL",
    url: "https://rss.arxiv.org/rss/cs.CL",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 50,
    note: "Verified RSS 2.0 on 2026-11-03; about 0.8 MB per full fetch.",
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
