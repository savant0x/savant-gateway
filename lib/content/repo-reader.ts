/**
 * Lazy repository resolution (FID-2026-1102-107).
 *
 * Ingestion remains the first enrichment pass. This module repairs rows that
 * were stored before the token-optional GitHub path existed, or while GitHub
 * was rate-limiting, and it adds the README once. The result is written back to
 * `content.items.github_json`, so later detail views make no request.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ContentItem, GitHubRepo } from "./types.ts";

import { fetchGithubRepo, repoSlugForItem } from "./github.ts";
import { fetchGithubReadme } from "./github-readme.ts";
import { saveItemGithub } from "./store/item-writes.ts";

const FAILURE_TTL_MS = 10 * 60 * 1_000;

export type RepoReaderDeps = {
  fetchRepo?: (slug: string) => Promise<GitHubRepo | null>;
  fetchReadme?: (slug: string) => Promise<string | null>;
  now?: () => string;
};

const failed = new Map<string, number>();

function rememberFailure(key: string): void {
  failed.set(key, Date.now() + FAILURE_TTL_MS);
}

function recentlyFailed(key: string): boolean {
  const until = failed.get(key);

  if (!until) return false;
  if (until > Date.now()) return true;

  failed.delete(key);

  return false;
}

export async function ensureGithubRepo(
  db: PostgresDatabase,
  item: ContentItem,
  deps: RepoReaderDeps = {},
): Promise<GitHubRepo | null> {
  if (item.kind !== "repo") return item.github;

  const existing = item.github;

  const hadFacts = existing !== null;

  // A string, including "", means the README question was answered.
  if (existing && existing.readmeHtml !== null) return existing;

  const slug = existing?.slug ?? repoSlugForItem(item);

  if (!slug) return existing;

  const key = `${item.id}:${slug}`;

  if (recentlyFailed(key)) return existing;

  let base = existing;

  if (!base) {
    base = await (deps.fetchRepo ?? fetchGithubRepo)(slug).catch(() => null);

    if (!base) {
      rememberFailure(key);

      return null;
    }
  }

  if (base.readmeHtml !== null) return base;

  const readme = await (deps.fetchReadme ?? fetchGithubReadme)(slug).catch(
    () => null,
  );

  if (readme === null) {
    if (!hadFacts) {
      await saveItemGithub(
        db,
        item.id,
        base,
        deps.now?.() ?? new Date().toISOString(),
      );
    }

    rememberFailure(key);

    return base;
  }

  const repo: GitHubRepo = { ...base, readmeHtml: readme };

  await saveItemGithub(
    db,
    item.id,
    repo,
    deps.now?.() ?? new Date().toISOString(),
  );
  failed.delete(key);

  return repo;
}
