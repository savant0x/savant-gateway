/**
 * GitHub README fetch and sanitization (FID-2026-1102-107).
 *
 * GitHub's `application/vnd.github.html+json` media type returns rendered
 * README HTML. The README is third-party HTML: only the tags below survive,
 * relative links point at the repository, relative images point at raw GitHub,
 * and every image is lazy. An empty result is a cached "this repository has no
 * README"; `null` means the request failed and may be retried later.
 */

import sanitizeHtml from "sanitize-html";

import { plainTextOf } from "./article-sanitize.ts";
import { githubToken } from "./policy.ts";

const API_BASE = "https://api.github.com/repos/";
const TIMEOUT_MS = 15_000;
const MAX_CHARS = 400_000;

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "kbd",
  "sub",
  "sup",
  "figure",
  "figcaption",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "details",
  "summary",
];

export type ReadmeDeps = {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  token?: string | null;
};

function absoluteImage(value: string, slug: string): string | null {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (!value || value.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }

  return `https://raw.githubusercontent.com/${slug}/HEAD/${value.replace(/^\.?\//, "")}`;
}

function absoluteLink(value: string, slug: string): string | null {
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  if (value.startsWith("#")) return `https://github.com/${slug}${value}`;
  if (value.startsWith("//")) return `https:${value}`;
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  return `https://github.com/${slug}/blob/HEAD/${value.replace(/^\.?\//, "")}`;
}

/** Sanitizes README HTML and resolves repository-relative targets. */
export function sanitizeReadmeHtml(html: string, slug: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      pre: ["class"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      details: ["open"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
      a: ["http", "https", "mailto"],
    },
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "noscript",
      "option",
      "iframe",
      "svg",
      "form",
      "button",
      "select",
      "template",
    ],
    transformTags: {
      h1: "h2",
      img: (_tagName, attribs) => {
        const src = attribs.src ? absoluteImage(attribs.src, slug) : null;

        if (!src) return { tagName: "span", attribs: {} };

        return {
          tagName: "img",
          attribs: { ...attribs, src, loading: "lazy" },
        };
      },
      a: (_tagName, attribs) => {
        const href = attribs.href ? absoluteLink(attribs.href, slug) : null;

        if (!href) return { tagName: "span", attribs: {} };

        return {
          tagName: "a",
          attribs: {
            ...attribs,
            href,
            rel: "noopener noreferrer",
            target: "_blank",
          },
        };
      },
    },
    exclusiveFilter: (frame) => {
      if (["img", "br", "hr", "td", "th"].includes(frame.tag)) return false;

      return (frame.text ?? "").replace(/\s+/g, "").length === 0;
    },
  }).trim();

  if (!clean) return "";
  if (!plainTextOf(clean) && !/<img\b/i.test(clean)) return "";

  return clean.slice(0, MAX_CHARS);
}

/** Pulls the rendered markdown region out of GitHub's README response. */
export function extractReadme(html: string): string | null {
  const article = /<article\b[^>]*class="[^"]*markdown-body[^"]*"[^>]*>/i.exec(
    html,
  );

  if (article) {
    const start = article.index + article[0].length;
    const end = html.lastIndexOf("</article>");

    return end > start ? html.slice(start, end) : html.slice(start);
  }

  const readme = /<div\b[^>]*id="readme"[^>]*>/i.exec(html);

  if (readme) {
    return html.slice(readme.index + readme[0].length);
  }

  return null;
}

export async function fetchGithubReadme(
  slug: string,
  deps: ReadmeDeps = {},
): Promise<string | null> {
  const token = deps.token === undefined ? githubToken() : deps.token;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.html+json",
    "User-Agent": "SavantGateway/0.1 content ingestion",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;

  try {
    response = await fetchImpl(`${API_BASE}${slug}/readme`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return response.status === 404 ? "" : null;
  }

  const html = (await response.text()).slice(0, MAX_CHARS);
  const region = extractReadme(html);

  if (!region) return "";

  return sanitizeReadmeHtml(region, slug);
}
