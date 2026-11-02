import type { GitHubRepo } from "@/lib/content/types";

import { formatCount } from "@/lib/content/format";

/**
 * Full repository panel (FID-2026-1102-106), restored from the reference
 * reader. Facts come from `content.items.github_json`, denormalized during a
 * fetch. The README is resolved once by `ensureGithubRepo` (FID-2026-1102-107);
 * this component makes no network request.
 */
export function RepoPanel({ repo }: { repo: GitHubRepo }) {
  const repoUrl = `https://github.com/${repo.slug}`;

  return (
    <>
      <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
              Repository
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold">
              <a
                className="underline-offset-4 hover:text-accent hover:underline"
                href={repoUrl}
                rel="noreferrer"
                target="_blank"
              >
                {repo.slug}
              </a>
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm text-muted">
            <span title={`${repo.stars.toLocaleString("en")} stars`}>
              ★ {formatCount(repo.stars)}
            </span>
            <span title={`${repo.forks.toLocaleString("en")} forks`}>
              ⑂ {formatCount(repo.forks)}
            </span>
          </div>
        </div>

        {repo.description ? (
          <p className="mt-3 text-sm leading-6 text-muted">
            {repo.description}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">
            GitHub did not publish a description for this repository.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          {repo.language ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 dark:border-white/10">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {repo.language}
            </span>
          ) : null}
          {repo.license ? (
            <span className="rounded-full border border-black/10 px-2.5 py-1 text-muted dark:border-white/10">
              {repo.license}
            </span>
          ) : null}
          {repo.topics.slice(0, 8).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-black/10 px-2.5 py-1 text-muted dark:border-white/10"
            >
              #{topic}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-black/10 pt-3 text-xs dark:border-white/10">
          <a
            className="text-accent underline-offset-4 hover:underline"
            href={repoUrl}
            rel="noreferrer"
            target="_blank"
          >
            View on GitHub ↗
          </a>
          {repo.homepage ? (
            <a
              className="text-muted underline-offset-4 hover:text-accent hover:underline"
              href={repo.homepage}
              rel="noreferrer"
              target="_blank"
            >
              Homepage ↗
            </a>
          ) : null}
          {repo.pushedAt ? (
            <span className="text-muted">
              Last push{" "}
              {new Date(repo.pushedAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </span>
          ) : null}
        </div>
      </section>

      {repo.readmeHtml ? (
        <article className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3 dark:border-white/10">
            <h2 className="text-sm font-semibold">README</h2>
            <a
              className="text-[11px] text-accent underline-offset-4 hover:underline"
              href={`${repoUrl}#readme`}
              rel="noreferrer"
              target="_blank"
            >
              Open on GitHub ↗
            </a>
          </div>
          <div
            dangerouslySetInnerHTML={{ __html: repo.readmeHtml }}
            className="readme-body mt-4"
          />
        </article>
      ) : null}
    </>
  );
}
