/**
 * Safe deployment diagnostics (FID-2026-1103-141).
 *
 * A provider record stores only the *name* of the environment variable that
 * holds its key. Local `.env.local` presence therefore proves nothing about the
 * Vercel runtime. This projection reports what the current runtime can actually
 * see — commit, branch, environment and key presence — and never a value, a
 * hash or a derived secret.
 */

export type DiagnosticProvider = {
  slug: string;
  label: string;
  keyEnvVar: string;
  enabled: boolean;
};

export type ProviderKeyState = {
  slug: string;
  label: string;
  keyEnvVar: string;
  enabled: boolean;
  configured: boolean;
};

export type DeploymentDiagnostics = {
  runtime: string;
  production: boolean;
  vercelEnv: string | null;
  commit: string | null;
  commitShort: string | null;
  branch: string | null;
  repository: string | null;
  siteOrigin: string | null;
  providerKeys: ProviderKeyState[];
  missingKeys: string[];
  generatedAt: string;
};

type Env = Readonly<Record<string, string | undefined>>;

function safeOrigin(raw: string | undefined) {
  const value = raw?.trim() ?? "";

  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function readCommit(env: Env) {
  const value = (env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? "").trim();

  return /^[0-9a-f]{7,40}$/i.test(value) ? value : null;
}

export function readDeploymentDiagnostics(
  env: Env,
  providers: DiagnosticProvider[],
  now = new Date(),
): DeploymentDiagnostics {
  const commit = readCommit(env);
  const owner = env.VERCEL_GIT_REPO_OWNER?.trim();
  const slug = env.VERCEL_GIT_REPO_SLUG?.trim();
  const providerKeys = providers.map((provider) => ({
    slug: provider.slug,
    label: provider.label,
    keyEnvVar: provider.keyEnvVar,
    enabled: provider.enabled,
    configured: Boolean(env[provider.keyEnvVar]?.trim()),
  }));

  return {
    runtime: env.NODE_ENV?.trim() || "unknown",
    production: env.NODE_ENV === "production",
    vercelEnv: env.VERCEL_ENV?.trim() || null,
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    branch: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    repository: owner && slug ? `${owner}/${slug}` : null,
    siteOrigin: safeOrigin(env.NEXT_PUBLIC_SITE_URL),
    providerKeys,
    missingKeys: providerKeys
      .filter((provider) => !provider.configured)
      .map((provider) => provider.keyEnvVar),
    generatedAt: now.toISOString(),
  };
}
