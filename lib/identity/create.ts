import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ProviderRecord } from "../providers/types.ts";
import type { AdminModelSummary } from "../types.ts";
import type {
  IdentityCaps,
  IdentityControlSnapshot,
  IdentityEstimate,
  IdentityRunMode,
  IdentityTarget,
} from "./types.ts";

import { providerKeyConfigured } from "../providers/registry.ts";
import { getModelForGateway, listAllModels } from "../storage/store/models.ts";
import {
  getProviderStatusBySlug,
  listProviderRecords,
} from "../storage/store/providers.ts";

import { PROTOCOL_ID } from "./battery.ts";
import { estimateRun, sumEstimates } from "./estimate.ts";
import {
  ensureProtocol,
  insertRun,
  listRunsForTarget,
  selectReference,
} from "./store.ts";
import {
  controlSnapshot,
  pickControlCandidate,
  providerSnapshot,
  targetFromModel,
} from "./targets.ts";

/**
 * Validation and creation for `POST /api/admin/identity/runs` (FID-087).
 *
 * A batch is validated end to end before the first row is inserted, so a mixed
 * batch cannot leave half-created runs. The estimate is computed from the
 * sealed battery, and a cap or quota problem is a refusal, never a soft
 * warning.
 */

export type CreateInput = {
  modelIds: string[];
  mode: IdentityRunMode;
  dryRun: boolean;
};

export type CreateResult =
  | {
      ok: true;
      estimates: IdentityEstimate[];
      runIds: string[];
      modelIds: string[];
    }
  | { ok: false; status: number; error: string };

type Prepared = {
  target: IdentityTarget;
  provider: ProviderRecord;
  control: IdentityControlSnapshot | null;
  estimate: IdentityEstimate;
  referenceId: string | null;
};

async function quotaFor(db: PostgresDatabase, provider: ProviderRecord) {
  try {
    const status = await getProviderStatusBySlug(db, provider.slug);

    return status.admissionRemainingTokens;
  } catch {
    return null;
  }
}

export async function createIdentityRuns(
  db: PostgresDatabase,
  input: CreateInput,
  caps: IdentityCaps,
  now = new Date().toISOString(),
): Promise<CreateResult> {
  const requested = input.modelIds.filter(
    (id) => typeof id === "string" && id.trim() !== "",
  );
  const ids = Array.from(new Set(requested));

  if (ids.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "modelIds must list at least one model.",
    };
  }

  if (ids.length !== input.modelIds.length) {
    return {
      ok: false,
      status: 400,
      error: "modelIds must be unique, non-empty strings.",
    };
  }

  const [models, providers] = await Promise.all([
    listAllModels(db),
    listProviderRecords(db),
  ]);
  const rows = new Map(models.map((model) => [model.id, model]));
  const providerBySlug = new Map(
    providers.map((provider) => [provider.slug, provider]),
  );
  const prepared: Prepared[] = [];

  for (const modelId of ids) {
    const row = rows.get(modelId);

    if (!row) {
      return { ok: false, status: 400, error: `Unknown model: ${modelId}.` };
    }

    if (row.access !== "free") {
      return {
        ok: false,
        status: 409,
        error: `Only free-pool models are eligible; ${modelId} is ${row.access}.`,
      };
    }

    const gateway = await getModelForGateway(db, modelId);

    if (!gateway) {
      return { ok: false, status: 400, error: `Unknown model: ${modelId}.` };
    }

    if (gateway.status !== "active" || !gateway.inCatalog) {
      return { ok: false, status: 409, error: `${modelId} is not published.` };
    }

    const provider = providerBySlug.get(gateway.upstreamSlug);

    if (!provider || !provider.enabled) {
      return {
        ok: false,
        status: 409,
        error: `${gateway.upstreamSlug} is not an enabled provider.`,
      };
    }

    if (!providerKeyConfigured(provider.keyEnvVar)) {
      return {
        ok: false,
        status: 409,
        error: `${provider.slug} has no configured credential.`,
      };
    }

    const active = await listRunsForTarget(db, modelId, 10);

    if (
      active.some((run) => run.status === "queued" || run.status === "running")
    ) {
      return {
        ok: false,
        status: 409,
        error: `${modelId} already has an active run.`,
      };
    }

    const target = targetFromModel(gateway, row.supportsTools);
    let protocolId = PROTOCOL_ID;

    if (!input.dryRun) {
      try {
        protocolId = (await ensureProtocol(db, now)).id;
      } catch (error) {
        return {
          ok: false,
          status: 409,
          error:
            error instanceof Error
              ? error.message
              : "The stored identity protocol does not match the current battery.",
        };
      }
    }

    const reference = await selectReference(db, {
      canonicalModelKey: target.canonicalKey,
      protocolId,
      now,
    });
    const controlRow = pickControlCandidate(models, {
      excludeModelId: modelId,
      excludeCanonicalKey: target.canonicalKey,
      protocol: gateway.protocol,
      enabledProvider: (slug) => {
        const candidate = providerBySlug.get(slug);

        return Boolean(
          candidate &&
          candidate.enabled &&
          providerKeyConfigured(candidate.keyEnvVar),
        );
      },
    });
    const control = reference
      ? await buildControl(db, controlRow, providerBySlug)
      : null;
    const estimate = estimateRun({
      mode: input.mode,
      hasReference: reference !== null,
      hasControl: control !== null,
      costInputMicros: target.costInputMicros,
      costOutputMicros: target.costOutputMicros,
      tokenWeight: target.tokenWeight,
      rpm: caps.rpm,
      maxRequestsPerModel: caps.maxRequestsPerModel,
      maxRequestsPerBatch: caps.maxRequestsPerBatch,
      quotaRemaining: await quotaFor(db, provider),
    });

    if (estimate.refusals.length > 0) {
      return {
        ok: false,
        status: 409,
        error: `${modelId}: ${estimate.refusals[0]}`,
      };
    }

    prepared.push({
      target,
      provider,
      control,
      estimate,
      referenceId: reference?.id ?? null,
    });
  }

  const total = sumEstimates(prepared.map((entry) => entry.estimate));

  if (total.requests > caps.maxRequestsPerBatch) {
    return {
      ok: false,
      status: 409,
      error: `The batch needs ${total.requests} requests; the batch cap is ${caps.maxRequestsPerBatch}. Split the batch.`,
    };
  }

  const estimates = prepared.map((entry) => entry.estimate);

  if (input.dryRun) {
    return {
      ok: true,
      estimates,
      runIds: [],
      modelIds: prepared.map((entry) => entry.target.modelId),
    };
  }

  const protocol = await ensureProtocol(db, now);
  const runIds: string[] = [];

  try {
    await db
      .transaction(async () => {
        for (const entry of prepared) {
          const run = await insertRun(db, {
            protocolId: protocol.id,
            target: entry.target,
            provider: providerSnapshot(entry.provider),
            control: entry.control,
            mode: input.mode,
            referenceId: entry.referenceId,
            estimate: entry.estimate,
            now,
          });

          runIds.push(run.id);
        }
      })
      .immediate();
  } catch (error) {
    // 23505 is PostgreSQL's unique-violation code: the partial active-run
    // index rejected a concurrent create. Any other failure is infrastructure
    // and must not be dressed up as a conflict.
    if ((error as { code?: string }).code !== "23505") throw error;

    return {
      ok: false,
      status: 409,
      error:
        "A run was created concurrently for one of these models. Nothing was inserted.",
    };
  }

  return {
    ok: true,
    estimates,
    runIds,
    modelIds: prepared.map((entry) => entry.target.modelId),
  };
}

async function buildControl(
  db: PostgresDatabase,
  row: AdminModelSummary | null,
  providers: Map<string, ProviderRecord>,
): Promise<IdentityControlSnapshot | null> {
  if (!row) return null;

  const gateway = await getModelForGateway(db, row.id);

  if (!gateway) return null;

  const provider = providers.get(gateway.upstreamSlug);

  if (!provider || !provider.enabled) return null;
  if (!providerKeyConfigured(provider.keyEnvVar)) return null;

  return controlSnapshot(gateway, row.supportsTools, provider);
}
