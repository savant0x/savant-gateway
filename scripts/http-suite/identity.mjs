/**
 * The rule this site must never break: a customer never learns who supplies the
 * models (FID-2026-1125-002).
 *
 * Pure functions, so a failure names the rule rather than a page. The stored
 * model id encodes the upstream account slug and the upstream's own publisher
 * path; the display id is the model's name, and a billing tier (`free/`,
 * `subscription/`) is a product prefix rather than a publisher.
 */

const TIERS = new Set(["free", "subscription"]);

/**
 * Why a published id is not provider-free, or `null` when it is.
 *
 * At most one namespace segment is allowed, and only when it is a billing tier:
 * `gpt-6-luna` and `free/gpt-6-luna` pass, `inferhub/alicn/gpt-6-luna` and
 * `inferhub/gpt-6-luna` do not.
 */
export function idNamespaceProblem(id) {
  const segments = String(id ?? "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) return "empty id";
  if (segments.length === 1) return null;
  if (segments.length === 2 && TIERS.has(segments[0])) return null;

  return `${segments.length} segments (${segments[0]}/…)`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The provider slugs that appear in `text` as a whole word.
 *
 * The boundary excludes `-`, so a slug that is a prefix of a longer id segment
 * (`mock` in the model `mock-paid`) is not a hit, and a slug inside a word
 * (`alloc` in "allocation") is not one either.
 */
export function slugHits(text, slugs) {
  const hits = [];

  for (const slug of slugs) {
    if (!slug) continue;

    const pattern = new RegExp(
      `(^|[^a-z0-9-])${escapeRegExp(slug)}([^a-z0-9-]|$)`,
      "i",
    );

    if (pattern.test(text)) hits.push(slug);
  }

  return hits;
}

/** A short window of text around each hit, so a failure points at the cause. */
export function slugContexts(text, slugs, radius = 60) {
  const samples = [];

  for (const slug of slugs) {
    if (!slug) continue;

    // The match, not the first substring occurrence: a provider slug is often
    // present inside a longer id or word many characters earlier.
    const match = new RegExp(
      `(^|[^a-z0-9-])${escapeRegExp(slug)}([^a-z0-9-]|$)`,
      "i",
    ).exec(text);

    if (!match) continue;

    const at = match.index + match[1].length;
    const start = Math.max(0, at - radius);
    const end = Math.min(text.length, at + slug.length + radius);

    samples.push(`${slug} in …${text.slice(start, end).replace(/\s+/g, " ")}…`);
  }

  return samples;
}
