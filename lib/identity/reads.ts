import "server-only";

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ProviderRecord } from "../providers/types.ts";
import type { AdminModelSummary } from "../types.ts";
import type {
  IdentityCorrectionRecord,
  IdentityPublishedView,
  IdentityRunDetail,
  IdentityRunRecord,
  IdentityTarget,
  IdentityVerdictRecord,
} from "./types.ts";

import { canonicalModelKey } from "../model-identity.ts";
import { providerKeyConfigured } from "../providers/registry.ts";
import { listAllModels, getModelForGateway } from "../storage/store/models.ts";
import { listProviderRecords } from "../storage/store/providers.ts";

import { publicIdentityView } from "./public-view.ts";
import { targetFromModel } from "./targets.ts";
import {
  countSamples,
  getPublishedVerdict,
  getRun,
  getVerdict,
  listCorrections,
  listFindings,
  listRuns,
} from "./store.ts";

/**
 * Read models for the two admin pages and the public panel.
 *
 * Every function takes the handle; the pages own the `getDatabase()` decision
 * so a failed boot renders an explanation instead of a 500. Nothing here sorts
 * by a hidden trust score: the surface shows the latest run and its verdict,
 * which is exactly what the runner wrote.
 */

export type IdentityTargetRow = {
  target: IdentityTarget;
  providerLabel: string;
  providerConfigured: boolean;
  lastRun: IdentityRunRecord | null;
  verdict: IdentityVerdictRecord | null;
};

function snapshot<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function providerMap(providers: ProviderRecord[]) {
  return new Map(providers.map((provider) => [provider.slug, provider]));
}

function usableProvider(
  providers: Map<string, ProviderRecord>,
  slug: string | null,
) {
  if (!slug) return null;

  const provider = providers.get(slug);

  if (!provider || !provider.enabled) return null;
  if (!providerKeyConfigured(provider.keyEnvVar)) return null;

  return provider;
}

/**
 * The free-pool targets the operator may run. The row's own access decides
 * eligibility, and the serving route supplies the snapshot.
 */
export async function listIdentityTargets(
  db: PostgresDatabase,
): Promise<IdentityTargetRow[]> {
  const [models, providers, runs] = await Promise.all([
    listAllModels(db),
    listProviderRecords(db),
    listRuns(db, 200),
  ]);
  const bySlug = providerMap(providers);
  const latestRun = new Map<string, IdentityRunRecord>();

  for (const run of runs) {
    if (!latestRun.has(run.targetModelId))
      latestRun.set(run.targetModelId, run);
  }

  const rows: IdentityTargetRow[] = [];

  for (const model of models) {
    if (
      model.access !== "free" ||
      model.status !== "active" ||
      !model.inCatalog
    ) {
      continue;
    }

    const gateway = await getModelForGateway(db, model.id);

    if (!gateway) continue;

    const provider = usableProvider(bySlug, gateway.upstreamSlug);

    if (!provider) continue;

    const run = latestRun.get(model.id) ?? null;
    const verdict = run ? await getVerdict(db, run.id) : null;

    rows.push({
      target: targetFromModel(gateway, model.supportsTools),
      providerLabel: provider.label,
      providerConfigured: true,
      lastRun: run,
      verdict,
    });
  }

  return rows;
}

export async function readRunDetail(
  db: PostgresDatabase,
  id: string,
): Promise<IdentityRunDetail | null> {
  const run = await getRun(db, id);

  if (!run) return null;

  const [findings, verdict, counts] = await Promise.all([
    listFindings(db, id),
    getVerdict(db, id),
    countSamples(db, id),
  ]);

  return {
    run,
    target: snapshot<IdentityTarget>(run.targetJson, {
      modelId: run.targetModelId,
      name: run.targetName,
      canonicalKey: run.canonicalModelKey,
      providerSlug: run.providerSlug,
      upstreamId: run.upstreamId,
      protocol: "chat",
      family: "",
      contextWindow: "",
      access: "free",
      supportsTools: false,
      costInputMicros: 0,
      costOutputMicros: 0,
      tokenWeight: 1,
    }),
    provider: snapshot(run.providerJson, {
      slug: run.providerSlug,
      kind: "openai" as const,
      baseUrl: "",
      keyEnvVar: "",
    }),
    control: run.controlJson
      ? snapshot(
          run.controlJson,
          null as unknown as IdentityRunDetail["control"],
        )
      : null,
    findings,
    verdict,
    samples: { target: counts.target, diffControl: counts.diffControl },
  };
}

export async function readPublishedIdentity(
  db: PostgresDatabase,
  modelId: string,
  now = new Date().toISOString(),
): Promise<IdentityPublishedView | null> {
  const published = await getPublishedVerdict(db, modelId);

  if (!published) return null;

  return publicIdentityView(
    published.verdict,
    published.findings,
    published.protocolId,
    now,
  );
}

export async function readCorrections(
  db: PostgresDatabase,
  limit = 20,
): Promise<IdentityCorrectionRecord[]> {
  return listCorrections(db, limit);
}

/**
 * True when the model is still present, enabled, and published. Publish refuses
 * a row the catalog would not serve; the identity store never re-enables it.
 */
export async function modelIsPublished(
  db: PostgresDatabase,
  model: AdminModelSummary,
) {
  const gateway = await getModelForGateway(db, model.id);

  return Boolean(gateway && gateway.status === "active" && gateway.inCatalog);
}

export { canonicalModelKey };
