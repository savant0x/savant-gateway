/**
 * HuggingFace Daily Papers (FID-2026-1102-094).
 *
 * The endpoint is public and unauthenticated. It returns one JSON array of
 * `{ paper: { id, title, summary, authors, upvotes, publishedAt } }` entries.
 * The arXiv id is the identity, so the same paper shown on two days upserts
 * instead of duplicating. The response is parsed here, not in the store, so a
 * malformed upstream body fails the source with a precise error.
 */

import type { ParsedItem } from "./types.ts";

import { plainTextBody } from "./feed-xml.ts";
import { CONTENT_LIMITS } from "./policy.ts";

export const HUGGINGFACE_DAILY_PAPERS_URL =
  "https://huggingface.co/api/daily_papers";

type HuggingFaceEntry = {
  paper?: {
    id?: unknown;
    title?: unknown;
    summary?: unknown;
    authors?: unknown;
    publishedAt?: unknown;
    upvotes?: unknown;
  };
};

function authorNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((author) =>
      author &&
      typeof author === "object" &&
      typeof (author as { name?: unknown }).name === "string"
        ? (author as { name: string }).name
        : null,
    )
    .filter((name): name is string => Boolean(name));
}

export function parseDailyPapers(
  body: string,
  maxItems: number = CONTENT_LIMITS.pageSize,
): ParsedItem[] {
  let raw: unknown;

  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error("HuggingFace returned invalid JSON.");
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      "HuggingFace daily_papers returned an unexpected shape (expected a JSON array).",
    );
  }

  const items: ParsedItem[] = [];

  for (const entry of raw.slice(0, maxItems) as HuggingFaceEntry[]) {
    const paper = entry?.paper;

    if (
      !paper ||
      typeof paper.id !== "string" ||
      typeof paper.title !== "string" ||
      !paper.id.trim() ||
      !paper.title.trim()
    ) {
      continue;
    }

    const summary =
      typeof paper.summary === "string" ? paper.summary.trim() : "";
    const published =
      typeof paper.publishedAt === "string"
        ? new Date(paper.publishedAt)
        : new Date();
    const publishedAt = Number.isNaN(published.getTime())
      ? new Date().toISOString()
      : published.toISOString();
    const authors = authorNames(paper.authors);
    const upvotes =
      typeof paper.upvotes === "number" &&
      Number.isSafeInteger(paper.upvotes) &&
      paper.upvotes >= 0
        ? paper.upvotes
        : null;

    items.push({
      externalId: paper.id,
      kind: "paper",
      title: paper.title.trim().slice(0, CONTENT_LIMITS.maxTitleChars),
      url: `https://huggingface.co/papers/${encodeURIComponent(paper.id)}`,
      excerpt: summary.slice(0, CONTENT_LIMITS.maxExcerptChars),
      bodyHtml: plainTextBody(summary),
      author:
        authors
          .slice(0, 4)
          .join(", ")
          .slice(0, CONTENT_LIMITS.maxAuthorChars) ||
        "HuggingFace Daily Papers",
      publishedAt,
      thumbnailUrl: null,
      videoId: null,
      tags: ["huggingface", "daily-papers"],
      ...(upvotes !== null
        ? {
            metrics: {
              views: 0,
              likes: upvotes,
              comments: 0,
              rating: null,
            },
          }
        : {}),
    });
  }

  return items;
}
