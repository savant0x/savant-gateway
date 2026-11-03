import type { PublicContentSource, SourceKind } from "./types.ts";

/**
 * Public source health (FID-2026-1102-104) is a coarse projection, never the
 * admin row. Upstream error text stays private; a reader only needs to know
 * whether the feed is current, late, failing, or intentionally paused.
 */

export type PublicSourceState = "ok" | "delayed" | "attention" | "paused";

export const SOURCE_STATUS_POLICY = {
  delayedAfterIntervals: 2,
  graceMinutes: 15,
  attentionAfterFailures: 3,
} as const;

export const PUBLIC_SOURCE_STATE_LABELS: Record<PublicSourceState, string> = {
  ok: "Current",
  delayed: "Delayed",
  attention: "Needs attention",
  paused: "Paused",
};

export const PUBLIC_SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  rss: "RSS / Atom",
  reddit: "Reddit",
  youtube: "YouTube",
  huggingface: "HuggingFace papers",
  trendshift: "Trendshift",
  hackernews: "Hacker News",
};

export function publicSourceState(
  source: PublicContentSource,
  now = new Date(),
): PublicSourceState {
  if (!source.enabled || source.status === "disabled") return "paused";

  if (
    source.status === "error" ||
    source.failureStreak >= SOURCE_STATUS_POLICY.attentionAfterFailures
  ) {
    return "attention";
  }

  if (!source.lastFetchedAt) return "delayed";

  const last = new Date(source.lastFetchedAt);

  if (Number.isNaN(last.getTime())) return "delayed";

  const limitMs =
    (source.fetchIntervalMinutes * SOURCE_STATUS_POLICY.delayedAfterIntervals +
      SOURCE_STATUS_POLICY.graceMinutes) *
    60 *
    1000;

  return now.getTime() > last.getTime() + limitMs ? "delayed" : "ok";
}

export function publicSourceStateLabel(state: PublicSourceState): string {
  return PUBLIC_SOURCE_STATE_LABELS[state];
}
