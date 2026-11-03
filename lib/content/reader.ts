/**
 * Reader body resolution (FID-2026-1102-106).
 *
 * Feed bodies are preferred because they cost no request. A body that is
 * missing, an aggregator metadata template, or shorter than the article floor
 * is replaced once by the publisher's page and persisted. Later views read the
 * stored body, so a busy item does not hammer its origin.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ContentItem } from "./types.ts";
import type { FetchArticleResult } from "./article.ts";

import {
  ArticleFetchError,
  fetchArticle,
  isMetadataTemplate,
  plainTextOf,
} from "./article.ts";
import { isHackerNewsDiscussionUrl } from "./hackernews.ts";
import { saveItemBody } from "./store/item-writes.ts";

export const ARTICLE_FLOOR = 200;

export type ReaderBody = {
  html: string | null;
  source: "feed" | "scrape" | "none";
  error: string | null;
};

export type ReaderDeps = {
  fetchPage?: (url: string) => Promise<FetchArticleResult>;
  now?: () => string;
};

/** A video description is the body; it is never scraped. */
export function bodyNeedsFetch(item: ContentItem): boolean {
  if (item.kind === "video") return false;

  const text = plainTextOf(item.bodyHtml);

  return (
    text.length === 0 || isMetadataTemplate(text) || text.length < ARTICLE_FLOOR
  );
}

/**
 * The page the reader may extract. A Hacker News thread is identity, not an
 * article: only its linked publisher page is eligible. An HN story without one
 * (Ask HN, Show HN text posts) stays on the gateway excerpt and is never
 * scraped from the thread.
 */
export function readerTarget(item: ContentItem): string | null {
  const external =
    item.externalUrl && item.externalUrl !== item.url ? item.externalUrl : null;

  if (isHackerNewsDiscussionUrl(item.url)) return external;

  return item.url;
}

type Failure = { until: number; message: string };

const failed = new Map<string, Failure>();
const FAILURE_TTL_MS = 10 * 60 * 1_000;

function usableFeedBody(item: ContentItem): string | null {
  if (!item.bodyHtml) return null;
  if (isMetadataTemplate(plainTextOf(item.bodyHtml))) return null;

  return item.bodyHtml;
}

function failureMessage(error: unknown): string {
  if (error instanceof ArticleFetchError) {
    if (error.reason === "http") {
      if (error.status === 401 || error.status === 403) {
        return `The publisher refused automated access (HTTP ${error.status}). Read the original at the publisher.`;
      }

      if (error.status === 429) {
        return "The publisher is rate-limiting automated readers (HTTP 429). Read the original at the publisher.";
      }

      return `The publisher answered HTTP ${error.status ?? "an error"}.`;
    }

    if (error.reason === "timeout") {
      return "The publisher did not answer before the request timed out.";
    }

    if (error.reason === "policy") {
      return error.message.replace(
        "Article request blocked: ",
        "The source address was blocked: ",
      );
    }
  }

  const raw = error instanceof Error ? error.message : "";
  const status = raw.match(/HTTP (\d{3})/)?.[1];

  if (status === "401" || status === "403") {
    return `The publisher refused automated access (HTTP ${status}). Read the original at the publisher.`;
  }

  if (status === "429") {
    return "The publisher is rate-limiting automated readers (HTTP 429). Read the original at the publisher.";
  }

  return "The source page could not be reached.";
}

function fallback(item: ContentItem, error: string): ReaderBody {
  const html = usableFeedBody(item);

  return { html, source: html ? "feed" : "none", error };
}

function rememberFailure(item: ContentItem, message: string): void {
  failed.set(item.id, {
    until: Date.now() + FAILURE_TTL_MS,
    message,
  });
}

export async function ensureArticleBody(
  db: PostgresDatabase,
  item: ContentItem,
  deps: ReaderDeps = {},
): Promise<ReaderBody> {
  if (!bodyNeedsFetch(item)) {
    return {
      html: item.bodyHtml,
      source: item.bodyHtml ? "feed" : "none",
      error: null,
    };
  }

  const target = readerTarget(item);

  if (!target) {
    const html = usableFeedBody(item);

    return { html, source: html ? "feed" : "none", error: null };
  }

  const recent = failed.get(item.id);

  if (recent && recent.until > Date.now()) {
    return fallback(item, recent.message);
  }

  const fetchPage = deps.fetchPage ?? fetchArticle;
  const now = deps.now ?? (() => new Date().toISOString());

  try {
    const page = await fetchPage(target);

    if (!page.sufficient || !page.html.trim()) {
      const message = "The source page did not expose enough readable text.";

      rememberFailure(item, message);

      return fallback(item, message);
    }

    await saveItemBody(db, item.id, page.html, now());
    failed.delete(item.id);

    return { html: page.html, source: "scrape", error: null };
  } catch (error) {
    const message = failureMessage(error);

    rememberFailure(item, message);

    return fallback(item, message);
  }
}
