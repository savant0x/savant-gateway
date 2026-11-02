/**
 * GitHub repo enrichment (FID-2026-1102-096, corrected by FID-2026-1102-106).
 *
 * Repo facts are denormalized at fetch time, never read during a render. The
 * public API answers unauthenticated requests, so a missing GITHUB_TOKEN lowers
 * the rate limit but must not produce a blank repository card. The token, when
 * present, only raises that limit.
 */

import type { GitHubRepo } from "./types.ts";

import { githubToken } from "./policy.ts";

const API_BASE = "https://api.github.com/repos/";
const TIMEOUT_MS = 15_000;

export function githubOgImageUrl(slug: string): string {
  return `https://opengraph.githubassets.com/1/${slug}`;
}

/** "owner/repo" from a GitHub URL, else null. */
export type RepoSlugSource = {
  url: string;
  title: string;
  bodyHtml: string | null;
};

function githubSlugInText(value: string): string | null {
  const match = value.match(
    /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i,
  );

  return match ? extractGithubSlug(match[0]) : null;
}

/**
 * A repository item can arrive three ways in the reference feeds: a GitHub
 * item URL (Trendshift), a `owner/repo` title, or a GitHub link inside the
 * feed body (Open Source Projects). Check all three.
 */
export function repoSlugForItem(item: RepoSlugSource): string | null {
  const fromUrl = extractGithubSlug(item.url);

  if (fromUrl) return fromUrl;

  const title = item.title.trim();

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(title)) {
    return title.toLowerCase();
  }

  return githubSlugInText(item.bodyHtml ?? "");
}

export function extractGithubSlug(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname !== "github.com" &&
      parsed.hostname !== "www.github.com"
    ) {
      return null;
    }

    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);

    if (!owner || !repo) return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
      return null;
    }

    return `${owner}/${repo}`.toLowerCase();
  } catch {
    return null;
  }
}

export function parseGithubRepo(slug: string, body: unknown): GitHubRepo {
  const record = (body ?? {}) as Record<string, unknown>;
  const license =
    record.license && typeof record.license === "object"
      ? ((record.license as Record<string, unknown>).spdx_id as string | null)
      : null;

  return {
    slug,
    description:
      typeof record.description === "string" && record.description.length > 0
        ? record.description
        : null,
    stars:
      typeof record.stargazers_count === "number" ? record.stargazers_count : 0,
    forks: typeof record.forks_count === "number" ? record.forks_count : 0,
    language: typeof record.language === "string" ? record.language : null,
    topics: Array.isArray(record.topics)
      ? record.topics
          .filter((topic): topic is string => typeof topic === "string")
          .slice(0, 12)
      : [],
    license: license && license !== "NOASSERTION" ? license : null,
    homepage:
      typeof record.homepage === "string" && record.homepage.length > 0
        ? record.homepage
        : null,
    pushedAt: typeof record.pushed_at === "string" ? record.pushed_at : null,
    ogImageUrl: githubOgImageUrl(slug),
    readmeHtml: null,
  };
}

/** Reads the denormalized column; a malformed row is missing data, not a crash. */
export function parseGithubJson(value: unknown): GitHubRepo | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (typeof parsed.slug !== "string" || !parsed.slug) return null;

    return {
      slug: parsed.slug,
      description:
        typeof parsed.description === "string" ? parsed.description : null,
      stars: typeof parsed.stars === "number" ? parsed.stars : 0,
      forks: typeof parsed.forks === "number" ? parsed.forks : 0,
      language: typeof parsed.language === "string" ? parsed.language : null,
      topics: Array.isArray(parsed.topics)
        ? parsed.topics.filter(
            (topic): topic is string => typeof topic === "string",
          )
        : [],
      license: typeof parsed.license === "string" ? parsed.license : null,
      homepage: typeof parsed.homepage === "string" ? parsed.homepage : null,
      pushedAt: typeof parsed.pushedAt === "string" ? parsed.pushedAt : null,
      ogImageUrl:
        typeof parsed.ogImageUrl === "string" && parsed.ogImageUrl
          ? parsed.ogImageUrl
          : githubOgImageUrl(parsed.slug),
      readmeHtml:
        typeof parsed.readmeHtml === "string" ? parsed.readmeHtml : null,
    };
  } catch {
    return null;
  }
}

export async function fetchGithubRepo(
  slug: string,
  token = githubToken(),
): Promise<GitHubRepo | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "SavantGateway/0.1 content ingestion",
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${slug}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return parseGithubRepo(slug, await response.json());
  } catch {
    return null;
  }
}
