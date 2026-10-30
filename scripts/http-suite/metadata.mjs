/**
 * Reading and auditing the social-card metadata in a rendered page.
 *
 * Kept separate from the live checks so the rules can be unit-tested against
 * fixture HTML: FID-2026-1030-063 shipped a site with no `og:image` at all, and
 * a gate is only worth having if its failure path is proven.
 */

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;

const ENTITIES = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function decode(value) {
  return value
    .replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

/**
 * Every meta tag, keyed by its `property` or `name`, first occurrence winning —
 * which is how crawlers read a duplicated tag.
 */
export function readMetaTags(html) {
  const tags = new Map();

  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = {};

    for (const [, name, value] of tag.matchAll(ATTRIBUTE)) {
      attributes[name.toLowerCase()] = decode(value);
    }

    const key = (attributes.property ?? attributes.name ?? "").toLowerCase();

    if (!key || tags.has(key)) continue;

    tags.set(key, attributes.content ?? "");
  }

  return tags;
}

export const REQUIRED_META = [
  "og:title",
  "og:description",
  "og:image",
  "og:image:width",
  "og:image:height",
  "twitter:card",
];

/**
 * Returns the problems that would make a share render badly. An empty array
 * means the page carries a complete card.
 */
export function auditSocialMetadata(html) {
  const issues = [];
  const tags = readMetaTags(html);
  const title = decode(TITLE.exec(html)?.[1] ?? "");

  if (!title) issues.push("no <title>");

  for (const key of REQUIRED_META) {
    if (!tags.get(key)) issues.push(`missing ${key}`);
  }

  if (tags.get("twitter:card") && tags.get("twitter:card") !== "summary_large_image") {
    issues.push(`twitter:card is "${tags.get("twitter:card")}"`);
  }

  const image = tags.get("og:image");

  if (image) {
    if (!/^https?:\/\//i.test(image)) {
      issues.push(`og:image is not an absolute url: ${image}`);
    } else {
      let parsed = null;

      try {
        parsed = new URL(image);
      } catch {
        issues.push(`og:image is not a url: ${image}`);
      }

      if (parsed && parsed.pathname === "/") {
        issues.push(`og:image points at the site root: ${image}`);
      }
    }
  }

  return issues;
}
