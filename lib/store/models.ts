import "server-only";

import type { ModelSummary, SyncedModel } from "../types";

import { db, nowIso } from "../db";

import { type GatewayModel, type ModelRow, toModelSummary } from "./shared";

export function listModels(): ModelSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM models
       WHERE status = 'active'
       ORDER BY CASE WHEN allow_free = 1 THEN 0 ELSE 1 END, provider ASC, sort_order ASC, name ASC`,
    )
    .all() as ModelRow[];

  return rows.map(toModelSummary);
}

export function getModelForGateway(modelId: string): GatewayModel | undefined {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId) as
    ModelRow | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    provider: row.provider,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    inputPriceMicros: row.input_price_micros,
    outputPriceMicros: row.output_price_micros,
    allowFree: row.allow_free === 1,
    status: row.status,
  };
}

export function replaceModels(rows: SyncedModel[]) {
  const insert = db.prepare(`
    INSERT INTO models
      (id, upstream_id, name, provider, context_window, token_weight,
       input_price_micros, output_price_micros, allow_free, supports_tools,
       supports_vision, health, status, sort_order, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  db.transaction((models: SyncedModel[]) => {
    db.prepare("DELETE FROM models").run();

    for (const model of models) {
      insert.run(
        model.id,
        model.upstreamId,
        model.name,
        model.provider,
        model.contextWindow,
        model.tokenWeight,
        model.inputPriceMicros,
        model.outputPriceMicros,
        model.allowFree ? 1 : 0,
        model.supportsTools ? 1 : 0,
        model.supportsVision ? 1 : 0,
        model.health,
        model.sortOrder,
        nowIso(),
      );
    }
  })(rows);
}
