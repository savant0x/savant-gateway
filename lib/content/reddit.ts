/**
 * Reddit source normalization (FID-2026-1103-120).
 *
 * Reddit's supported, documented read path is the per-subreddit Atom feed.
 * Operators paste every form of a subreddit URL, so the URL is canonicalized at
 * the source boundary; a pasted HTML page would otherwise parse as zero items.
 * Reddit blocks datacenter ranges on some days, so a fetch can still fail — the
 * canonical URL makes that a fetch failure, not a configuration trap.
 */

const REDDIT_HOSTS = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "np.reddit.com",
  "m.reddit.com",
]);

const SUBREDDIT = /^[A-Za-z0-9_]{1,64}$/;

/** Accepts `r/name`, any Reddit subreddit URL, and returns the name. */
export function extractSubreddit(raw: string): string | null {
  const value = raw.trim();
  const bare = value.match(/^\/?r\/([A-Za-z0-9_]+)\/?$/);

  if (bare) return SUBREDDIT.test(bare[1]) ? bare[1] : null;

  try {
    const url = new URL(value);

    if (!REDDIT_HOSTS.has(url.hostname.toLowerCase())) return null;

    const match = url.pathname.match(/^\/r\/([A-Za-z0-9_]+)(?:\/|$)/);

    return match && SUBREDDIT.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

/** The canonical official feed for a subreddit, or null for a non-Reddit URL. */
export function normalizeRedditUrl(raw: string): string | null {
  const subreddit = extractSubreddit(raw);

  return subreddit ? `https://www.reddit.com/r/${subreddit}/hot.rss` : null;
}
