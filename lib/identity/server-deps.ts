import "server-only";

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ProviderRecord } from "../providers/types.ts";
import type { IdentityCaps } from "./types.ts";

import { randomBytes } from "node:crypto";

import { getProvider } from "../storage/store/providers.ts";
import { providerKeyConfigured } from "../providers/registry.ts";
import { providerHeaders } from "../providers/request.ts";

import {
  createProbeClient,
  type ProbeDeps,
  type ProbeProvider,
} from "./probe-client.ts";
import { executeRun, type RunnerDeps } from "./runner.ts";

/**
 * Live probe wiring for FID-087.
 *
 * This is the only identity module that reads a credential. The resolver
 * returns the registry identity fields the runner persists, and the header
 * builder closes over the full record so default headers never reach
 * `provider_json`. A provider with no configured key is not available, which
 * turns a missing secret into a clean `provider_missing` run failure.
 */
export function createRunnerDeps(
  db: PostgresDatabase,
  caps: IdentityCaps,
): RunnerDeps {
  const records = new Map<string, ProviderRecord>();

  async function resolveProvider(
    slug: string,
  ): Promise<ProbeProvider | undefined> {
    const record = await getProvider(db, slug);

    if (
      !record ||
      !record.enabled ||
      !providerKeyConfigured(record.keyEnvVar)
    ) {
      return undefined;
    }

    records.set(record.slug, record);

    return {
      slug: record.slug,
      kind: record.kind,
      baseUrl: record.baseUrl,
      keyEnvVar: record.keyEnvVar,
    };
  }

  const probeDeps: ProbeDeps = {
    fetch,
    headers: (provider) => {
      const record = records.get(provider.slug);

      if (!record) {
        throw new Error(`Provider ${provider.slug} was not resolved.`);
      }

      return providerHeaders(record);
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  };

  return {
    probe: createProbeClient(probeDeps, { rpm: caps.rpm }),
    now: () => Date.now(),
    resolveProvider,
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    maxRequests: caps.maxRequestsPerModel,
    retentionDays: caps.retentionDays,
  };
}

/**
 * Runs the batch sequentially after the route has answered. The deployment is a
 * single long-lived Node process (FID-087), so the promise outlives the
 * response; a process restart leaves the row `queued` and the admin page offers
 * Start again.
 */
export function startIdentityRuns(
  db: PostgresDatabase,
  runIds: string[],
  caps: IdentityCaps,
) {
  const deps = createRunnerDeps(db, caps);

  void (async () => {
    for (const runId of runIds) {
      try {
        await executeRun(db, runId, deps);
      } catch (error) {
        // `executeRun` records its own failures. A rejection here means the
        // store itself was unreachable, which no retry in this loop can fix.
        // eslint-disable-next-line no-console
        console.error(
          `[identity.runner] ${runId}: ${
            error instanceof Error ? error.message : "run dispatch failed"
          }`,
        );
      }
    }
  })();
}
