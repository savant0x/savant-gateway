import type { PublicContentSource } from "./types.ts";

import { publicSourceState, type PublicSourceState } from "./status.ts";

/**
 * Source freshness and remediation (FID-2026-1103-129).
 *
 * Public readers get counts and ages; operators get a typed next action. Raw
 * upstream error text can remain available as a detail for the operator, but it
 * is never used as the explanation itself: the same failure can hide a bad URL,
 * a publisher blocking datacenter traffic, or a malformed feed.
 */

export type SourceFailureClass =
  "config" | "network" | "http" | "parse" | "unknown";

export type SourceGuidance = {
  state: PublicSourceState;
  failureClass: SourceFailureClass | null;
  hint: string;
  action: string;
};

export type PublicSourceSummary = {
  total: number;
  current: number;
  delayed: number;
  attention: number;
  paused: number;
  lastSuccessAt: string | null;
};

export function publicSourceAge(
  fetchedAt: string | null,
  now = new Date(),
): string {
  if (!fetchedAt) return "never";

  const at = new Date(fetchedAt);

  if (Number.isNaN(at.getTime())) return "unknown";

  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - at.getTime()) / 60_000),
  );

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h ago`;

  return `${Math.floor(hours / 24)} d ago`;
}

export function summarizePublicSources(
  sources: PublicContentSource[],
  now = new Date(),
): PublicSourceSummary {
  const summary: PublicSourceSummary = {
    total: sources.length,
    current: 0,
    delayed: 0,
    attention: 0,
    paused: 0,
    lastSuccessAt: null,
  };

  for (const source of sources) {
    const state = publicSourceState(source, now);

    if (state === "ok") summary.current += 1;
    else summary[state] += 1;

    if (
      source.lastSuccessAt &&
      (!summary.lastSuccessAt ||
        new Date(source.lastSuccessAt).getTime() >
          new Date(summary.lastSuccessAt).getTime())
    ) {
      summary.lastSuccessAt = source.lastSuccessAt;
    }
  }

  return summary;
}

export function classifySourceFailure(
  message: string | null | undefined,
): SourceFailureClass {
  const text = message?.toLowerCase() ?? "";

  if (!text) return "unknown";

  if (
    /channel id|subreddit|must use|is required|not configured|config|url/.test(
      text,
    )
  ) {
    return "config";
  }

  if (/http \d{3}|status \d{3}/.test(text)) return "http";
  if (/timeout|timed out|network|fetch|dns|econn|socket|abort/.test(text))
    return "network";
  if (/parse|xml|json|malformed|unexpected token/.test(text)) return "parse";

  return "unknown";
}

type SourceWithError = PublicContentSource & {
  lastError?: string | null;
};

const ACTION_BY_CLASS: Record<SourceFailureClass, string> = {
  config: "Correct the source URL, stream, or required channel id.",
  network:
    "Retry the fetch; the publisher may block datacenter traffic or be temporarily unreachable.",
  http: "Check the source URL; a 4xx usually means the feed moved or now requires access.",
  parse:
    "Verify the URL still returns RSS, Atom, or the selected typed API feed.",
  unknown:
    "Retry once, then inspect the latest fetch cycle for the bounded error.",
};

export function sourceGuidance(
  source: SourceWithError,
  now = new Date(),
): SourceGuidance {
  const state = publicSourceState(source, now);

  if (state === "paused") {
    return {
      state,
      failureClass: null,
      hint: "The source is disabled and is not being fetched.",
      action: "Re-enable it only after correcting the feed or access problem.",
    };
  }

  if (state === "delayed") {
    const age = source.lastSuccessAt
      ? publicSourceAge(source.lastSuccessAt, now)
      : null;
    const hint = age
      ? `No successful fetch within two intervals and the grace period. Last success: ${age}.`
      : "No successful fetch has been recorded yet.";

    return {
      state,
      failureClass: null,
      hint,
      action:
        "Run Fetch; if it keeps failing, verify the feed URL and publisher access.",
    };
  }

  if (state === "attention") {
    const failureClass = classifySourceFailure(source.lastError);
    const hint = source.lastError
      ? `The last fetch failed (${failureClass}).`
      : "The source has reached the failure attention threshold.";

    return {
      state,
      failureClass,
      hint,
      action: ACTION_BY_CLASS[failureClass],
    };
  }

  return {
    state,
    failureClass: null,
    hint: source.lastSuccessAt
      ? `Last success ${publicSourceAge(source.lastSuccessAt, now)}.`
      : "Waiting for the first successful fetch.",
    action: "No action is needed while the source remains current.",
  };
}

/** The hub's empty-state explanation, derived from actual source state. */
export function publicHubEmptyExplanation(
  sources: PublicContentSource[],
  now = new Date(),
) {
  const summary = summarizePublicSources(sources, now);

  if (summary.total === 0) {
    return {
      title: "No sources are configured.",
      body: "Signal is enabled but has no feeds yet. An operator can add one in Admin → Content.",
    };
  }

  if (summary.paused === summary.total) {
    return {
      title: "Every Signal source is paused.",
      body: "Nothing is being fetched right now. An operator can re-enable a source after checking it.",
    };
  }

  if (summary.attention > 0) {
    return {
      title: `${summary.attention} source${summary.attention === 1 ? "" : "s"} need attention.`,
      body: "The remaining sources have not produced a piece yet. Source status explains the failing fetch without publishing upstream error text.",
    };
  }

  if (summary.delayed > 0) {
    return {
      title: `${summary.delayed} source${summary.delayed === 1 ? "" : "s"} are delayed.`,
      body: "A delayed source has not completed a successful fetch within its expected interval. Available pieces remain below.",
    };
  }

  return {
    title: "Sources are current, but no pieces are published yet.",
    body: "The next successful fetch will add items here. Source status shows the last success for every feed.",
  };
}
