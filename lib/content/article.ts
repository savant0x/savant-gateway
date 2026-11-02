/**
 * Article extraction (FID-2026-1102-106).
 *
 * The reference site's reader kept the publisher's feed body when the feed
 * supplied one and fetched the source page when it did not. This module is
 * that fallback: it locates the main content region, resolves image sources,
 * and sanitizes the result before it can reach a page.
 *
 * Third-party HTML is never trusted. The allowlist removes anchors (the page
 * carries its own explicit original link), scripts, styles, iframes, forms,
 * event handlers, and non-HTTP image schemes. A page that yields less than
 * 200 characters of visible text is reported as insufficient rather than
 * rendered as an empty-looking article.
 */

import {
  isMetadataTemplate,
  plainTextOf,
  sanitizeArticleHtml,
} from "./article-sanitize.ts";
import { FETCH_POLICY, validatePublicHttpUrl } from "./url.ts";

export { isMetadataTemplate, plainTextOf, sanitizeArticleHtml };

export const MIN_ARTICLE_TEXT = 200;

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = FETCH_POLICY.timeoutMs;

export type ExtractedArticle = {
  html: string;
  sufficient: boolean;
  textLength: number;
  sourceTitle: string | null;
};

export type FetchArticleResult = ExtractedArticle;

export type FetchArticleDeps = {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
};

export type ArticleFailureReason = "http" | "policy" | "timeout" | "network";

export class ArticleFetchError extends Error {
  readonly reason: ArticleFailureReason;
  readonly status?: number;

  constructor(message: string, reason: ArticleFailureReason, status?: number) {
    super(message);
    this.name = "ArticleFetchError";
    this.reason = reason;
    this.status = status;
  }
}

type ContainerSpec = { tag: string; opening: RegExp };

/**
 * Ordered from most specific to least. Balanced slicing follows the opening
 * tag, so a nested `<div>` cannot truncate the region at its first closing tag
 * (the failure mode of the reference site's `role="main"` regex).
 */
const CONTAINERS: ContainerSpec[] = [
  {
    tag: "blockquote",
    opening: /<blockquote\b[^>]*class=["'][^"']*\babstract\b[^"']*["'][^>]*>/i,
  },
  {
    tag: "section",
    opening: /<section\b[^>]*class=["'][^"']*\babstract\b[^"']*["'][^>]*>/i,
  },
  {
    tag: "div",
    opening: /<div\b[^>]*class=["'][^"']*\babstract\b[^"']*["'][^>]*>/i,
  },
  {
    tag: "div",
    opening:
      /<div\b[^>]*class=["'][^"']*(?:article[-_]?body|article-container__content|blog-article-container|post[-_]?content|entry[-_]?content|story[-_]?body|article[-_]?content|post[-_]?body|content[-_]?body)[^"']*["'][^>]*>/i,
  },
  { tag: "article", opening: /<article\b[^>]*>/i },
  { tag: "main", opening: /<main\b[^>]*>/i },
  { tag: "div", opening: /<div\b[^>]*role=["']main["'][^>]*>/i },
];

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match
    ? match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null
    : null;
}

function stripDocumentNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
}

/** Returns the inner HTML of a balanced element, or null when unclosed. */
function balancedSlice(
  html: string,
  opening: RegExp,
  tag: string,
): string | null {
  const match = opening.exec(html);

  if (!match) return null;

  const start = match.index + match[0].length;
  const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  let depth = 1;
  let cursor = start;

  tags.lastIndex = start;

  for (let next = tags.exec(html); next; next = tags.exec(html)) {
    if (next[0][1] === "/") depth -= 1;
    else depth += 1;

    if (depth === 0) {
      cursor = next.index;
      break;
    }
    cursor = next.index;
  }

  return cursor > start ? html.slice(start, cursor) : null;
}

function findJsonArticleBody(raw: unknown, depth = 0): string | null {
  if (depth > 4 || raw === null) return null;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const found = findJsonArticleBody(entry, depth + 1);

      if (found) return found;
    }

    return null;
  }
  if (typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const body = record.articleBody;

  if (typeof body === "string" && body.trim().length >= MIN_ARTICLE_TEXT) {
    return body.trim();
  }

  for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
    const found = findJsonArticleBody(record[key], depth + 1);

    if (found) return found;
  }

  return null;
}

function jsonArticleHtml(html: string): string | null {
  const scripts = Array.from(
    html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  );

  for (const script of scripts) {
    try {
      const body = findJsonArticleBody(JSON.parse(script[1]));

      if (body) return textToHtml(body);
    } catch {
      // A malformed JSON-LD block is not an article failure.
    }
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function paragraphFallback(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const source = body ? body[1] : html;
  const paragraphs: string[] = [];

  for (const match of Array.from(
    source.matchAll(/<(p|h2|h3|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi),
  )) {
    const text = plainTextOf(match[0]);

    if (text.length < 40) continue;
    if (
      /^(advertisement|subscribe|cookie|sign up|newsletter|follow us)\b/i.test(
        text,
      )
    ) {
      continue;
    }

    paragraphs.push(match[0]);

    if (paragraphs.length >= 60) break;
  }

  return paragraphs.length > 0 ? `<div>${paragraphs.join("")}</div>` : source;
}

/**
 * Extracts and sanitizes the best readable region. Structured data wins when
 * present because it is the publisher's explicit article body; semantic
 * containers are next; a paragraph scan is the last resort.
 */
export function extractArticle(
  html: string,
  baseUrl: string,
): ExtractedArticle {
  const sourceTitle = extractTitle(html);

  if (!html.trim()) {
    return { html: "", sufficient: false, textLength: 0, sourceTitle };
  }

  const structured = jsonArticleHtml(html);
  const readable = stripDocumentNoise(html);
  const candidates: string[] = [];

  if (structured) candidates.push(structured);

  for (const spec of CONTAINERS) {
    const region = balancedSlice(readable, spec.opening, spec.tag);

    if (region) candidates.push(region);
  }

  candidates.push(paragraphFallback(readable));

  let bestHtml = "";
  let bestLength = 0;

  for (const candidate of candidates) {
    const clean = sanitizeArticleHtml(candidate, baseUrl);
    const length = plainTextOf(clean).length;

    if (length > bestLength) {
      bestHtml = clean;
      bestLength = length;
    }

    if (length >= MIN_ARTICLE_TEXT) {
      return {
        html: clean,
        sufficient: true,
        textLength: length,
        sourceTitle,
      };
    }
  }

  return {
    html: bestHtml,
    sufficient: bestLength >= MIN_ARTICLE_TEXT,
    textLength: bestLength,
    sourceTitle,
  };
}

export async function fetchArticle(
  url: string,
  deps: FetchArticleDeps = {},
): Promise<FetchArticleResult> {
  const policy = validatePublicHttpUrl(url);

  if (!policy.ok) {
    throw new ArticleFetchError(
      `Article request blocked: ${policy.error}`,
      "policy",
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(policy.url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 SavantGateway/0.1",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new ArticleFetchError(
      timedOut
        ? "Article request timed out."
        : "Article request failed before a response.",
      timedOut ? "timeout" : "network",
    );
  }

  if (!response.ok) {
    throw new ArticleFetchError(
      `Article request failed: HTTP ${response.status} for ${url}`,
      "http",
      response.status,
    );
  }

  const buffer = await response.arrayBuffer();
  const truncated =
    buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(truncated);

  return extractArticle(html, policy.url.toString());
}
