import type { PolicySlug } from "./legal-meta";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePolicy, type PolicyBlock } from "./legal-markdown";

export * from "./legal-meta";

const cache = new Map<string, PolicyBlock[]>();

export function policyPath(version: string, slug: PolicySlug): string {
  return join(process.cwd(), "content", "legal", version, `${slug}.md`);
}

export function readPolicyBody(
  version: string,
  slug: PolicySlug,
): PolicyBlock[] {
  const key = `${version}/${slug}`;
  const cached = cache.get(key);

  if (cached) return cached;

  const blocks = parsePolicy(readFileSync(policyPath(version, slug), "utf8"));

  cache.set(key, blocks);

  return blocks;
}
