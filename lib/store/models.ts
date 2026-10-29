import "server-only";

import type { AdminModelSummary, ModelSummary, SyncedModel } from "../types";

import { db, nowIso } from "../db";
import { defaultSellMicros } from "../pricing";

import {
  type GatewayModel,
  type ModelRow,
  toAdminModelSummary,
  toModelSummary,
} from "./shared";

const PUBLIC_SCOPE = "in_catalog = 1 AND status = 'active'";

export function listModels(): ModelSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM models
       WHERE ${PUBLIC_SCOPE}
       ORDER BY CASE WHEN allow_free = 1 AND token_weight > 0 THEN 0 ELSE 1 END,
                provider ASC, sort_order ASC, name ASC`,
    )
    .all() as ModelRow[];

  return rows.map(toModelSummary);
}

export function listAllModels(): AdminModelSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM models
       ORDER BY in_catalog DESC,
                CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                CASE WHEN allow_free = 1 AND token_weight > 0 THEN 0 ELSE 1 END,
                provider ASC, sort_order ASC, name ASC`,
    )
    .all() as ModelRow[];

  return rows.map(toAdminModelSummary);
}

export function setModelStatus(modelId: string, status: "active" | "disabled") {
  const result = db
    .prepare("UPDATE models SET status = ? WHERE id = ?")
    .run(status, modelId);

  return result.changes > 0;
}

export function setModelPricing(
  modelId: string,
  sellInputMicros: number,
  sellOutputMicros: number,
) {
  const result = db
    .prepare(
      `UPDATE models
       SET sell_input_micros = ?, sell_output_micros = ?, price_source = 'manual'
       WHERE id = ?`,
    )
    .run(
      Math.max(0, Math.round(sellInputMicros)),
      Math.max(0, Math.round(sellOutputMicros)),
      modelId,
    );

  return result.changes > 0;
}

export function getModelForGateway(modelId: string): GatewayModel | undefined {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId) as
    ModelRow | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    family: row.provider,
    contextWindow: row.context_window,
    tokenWeight: row.token_weight,
    costInputMicros: row.input_price_micros,
    costOutputMicros: row.output_price_micros,
    sellInputMicros: row.sell_input_micros,
    sellOutputMicros: row.sell_output_micros,
    allowFree: row.allow_free === 1,
    status: row.status,
    inCatalog: row.in_catalog === 1,
  };
}

/**
 * Upserts the provider catalog. Manual sell prices, operator disables, and
 * rows that vanished upstream are all preserved; vanished rows are marked
 * `in_catalog = 0` rather than deleted.
 */
export function replaceModels(rows: SyncedModel[], markupBps: number) {
  const existing = new Map<string, ModelRow>();

  for (const row of db.prepare("SELECT * FROM models").all() as ModelRow[]) {
    existing.set(row.id, row);
  }

  const upsert = db.prepare(`
    INSERT INTO models
      (id, upstream_id, name, provider, context_window, token_weight,
       input_price_micros, output_price_micros, sell_input_micros,
       sell_output_micros, price_source, in_catalog, allow_free,
       supports_tools, supports_vision, health, status, sort_order, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      upstream_id = excluded.upstream_id,
      name = excluded.name,
      provider = excluded.provider,
      context_window = excluded.context_window,
      token_weight = excluded.token_weight,
      input_price_micros = excluded.input_price_micros,
      output_price_micros = excluded.output_price_micros,
      sell_input_micros = excluded.sell_input_micros,
      sell_output_micros = excluded.sell_output_micros,
      price_source = excluded.price_source,
      in_catalog = 1,
      allow_free = excluded.allow_free,
      supports_tools = excluded.supports_tools,
      supports_vision = excluded.supports_vision,
      health = excluded.health,
      sort_order = excluded.sort_order,
      synced_at = excluded.synced_at
  `);

  const syncedAt = nowIso();

  db.transaction((models: SyncedModel[]) => {
    db.prepare("UPDATE models SET in_catalog = 0").run();

    for (const model of models) {
      const current = existing.get(model.id);
      const isFree = model.allowFree && model.tokenWeight > 0;
      const keepManual = current?.price_source === "manual";
      const sellInput = isFree
        ? 0
        : keepManual
          ? current.sell_input_micros
          : defaultSellMicros(model.costInputMicros, markupBps);
      const sellOutput = isFree
        ? 0
        : keepManual
          ? current.sell_output_micros
          : defaultSellMicros(model.costOutputMicros, markupBps);

      upsert.run(
        model.id,
        model.upstreamId,
        model.name,
        model.family,
        model.contextWindow,
        model.tokenWeight,
        model.costInputMicros,
        model.costOutputMicros,
        sellInput,
        sellOutput,
        keepManual ? "manual" : "auto",
        model.allowFree ? 1 : 0,
        model.supportsTools ? 1 : 0,
        model.supportsVision ? 1 : 0,
        model.health,
        current?.status ?? "active",
        model.sortOrder,
        syncedAt,
      );
    }
  })(rows);
}

export function applyCatalogMarkup(markupBps: number, applyToAll: boolean) {
  const rows = db
    .prepare("SELECT * FROM models WHERE in_catalog = 1")
    .all() as ModelRow[];
  const update = db.prepare(
    `UPDATE models
     SET sell_input_micros = ?, sell_output_micros = ?, price_source = 'auto'
     WHERE id = ?`,
  );

  let changed = 0;

  db.transaction(() => {
    for (const row of rows) {
      if (row.allow_free === 1 && row.token_weight > 0) {
        update.run(0, 0, row.id);
        changed += 1;
        continue;
      }

      if (!applyToAll && row.price_source === "manual") continue;

      update.run(
        defaultSellMicros(row.input_price_micros, markupBps),
        defaultSellMicros(row.output_price_micros, markupBps),
        row.id,
      );
      changed += 1;
    }
  })();

  return changed;
}
