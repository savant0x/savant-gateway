/**
 * Reader HTML sanitization (FID-2026-1102-106).
 *
 * Kept separate from extraction so the allowlist has one definition and the
 * fetch/extraction module stays under the repository's file-size ceiling.
 */

import sanitizeHtml from "sanitize-html";

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
];

const SANITIZE_BASE: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
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
  ],
  exclusiveFilter: (frame) => {
    if (!ALLOWED_TAGS.includes(frame.tag)) return false;

    const text = frame.text?.replace(/\s+/g, " ").trim() ?? "";

    return (
      text.length === 0 && !["img", "br", "hr", "td", "th"].includes(frame.tag)
    );
  },
};

function absoluteUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

export function sanitizeArticleHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    ...SANITIZE_BASE,
    transformTags: {
      h1: "h2",
      img: (tagName, attribs) => {
        const src = attribs.src ? absoluteUrl(attribs.src, baseUrl) : null;

        return {
          tagName,
          attribs: {
            ...attribs,
            ...(src ? { src } : {}),
            loading: "lazy",
          },
        };
      },
    },
  }).trim();
}

/** Visible text after sanitization, used for the sufficiency floor. */
export function plainTextOf(html: string | null): string {
  if (!html) return "";

  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "noscript", "template"],
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function isMetadataTemplate(plain: string): boolean {
  const hasArticle = /\bArticle URL\s*:/i.test(plain);
  const hasComments = /\bComments URL\s*:/i.test(plain);
  const hasPoints = /\b(Points|#\s*Comments)\s*:/i.test(plain);

  return hasArticle && hasComments && hasPoints;
}
