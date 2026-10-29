import "server-only";

import type { AdminModelSummary, ModelAccess, SyncedModel } from "../types";

import { db, nowIso } from "../db";
import { defaultGroupSlug, pricesForGroup } from "../model-groups";
import { defaultSellMicros } from "../pricing";

import { MODEL_SELECT } from "./model-sql";
import { getMarkupBps } from "./settings";
import {
  accessFor,
  type GatewayModel,
  type ModelRow,
  toAdminModelSummary,
  toGatewayModel,
} from "./shared";

export function listAllModels(): AdminModelSummary[] {
  const rows = db
    .prepare(
      `${MODEL_SELECT}
       ORDER BY m.in_catalog DESC,
                CASE WHEN m.status = 'active' THEN 0 ELSE 1 END,
                CASE WHEN g.billing_mode = 'free' THEN 0 ELSE 1 END,
                COALESCE(g.sort_order, 9999) ASC, m.provider ASC,
                m.sort_order ASC, m.name ASC`,
    )
    .all() as ModelRow[];

  return rows.map(toAdminModelSummary);
}

export type ModelStatusResult = "ok" | "not_found" | "cost_unknown";

export function setModelStatus(
  modelId: string,
  status: "active" | "disabled",
): ModelStatusResult {
  if (status === "active") {
    const row = db
      .prepare(
        `SELECT m.allow_free, m.token_weight, m.upstream_id, m.group_slug,
                m.cost_source, g.billing_mode AS group_billing_mode
         FROM models m
         LEFT JOIN model_groups g ON g.slug = m.group_slug
         WHERE m.id = ?`,
      )
      .get(modelId) as
      | Pick<
          ModelRow,
          | "allow_free"
          | "token_weight"
          | "upstream_id"
          | "group_slug"
          | "group_billing_mode"
          | "cost_source"
        >
      | undefined;

    if (!row) return "not_found";

    if (accessFor(row) !== "free" && row.cost_source === "unknown") {
      return "cost_unknown";
    }
  }

  const result = db
    .prepare("UPDATE models SET status = ? WHERE id = ?")
    .run(status, modelId);

  return result.changes > 0 ? "ok" : "not_found";
}

export function setModelCost(
  modelId: string,
  costInputMicros: number,
  costOutputMicros: number,
) {
  const row = db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get(modelId) as ModelRow | undefined;

  if (!row) return false;

  const input = Math.max(0, Math.round(costInputMicros));
  const output = Math.max(0, Math.round(costOutputMicros));
  const markupBps = getMarkupBps();
  const sell =
    row.price_source === "manual"
      ? {
          sellInputMicros: row.sell_input_micros,
          sellOutputMicros: row.sell_output_micros,
        }
      : {
          sellInputMicros: defaultSellMicros(input, markupBps),
          sellOutputMicros: defaultSellMicros(output, markupBps),
        };
  const priced = pricesForGroup({
    billingMode: accessFor(row),
    ...sell,
  });

  db.prepare(
    `UPDATE models
     SET input_price_micros = ?, output_price_micros = ?, cost_source = 'manual',
         sell_input_micros = ?, sell_output_micros = ?
     WHERE id = ?`,
  ).run(
    input,
    output,
    priced.sellInputMicros,
    priced.sellOutputMicros,
    modelId,
  );

  return true;
}

export function setModelPricing(
  modelId: string,
  sellInputMicros: number,
  sellOutputMicros: number,
) {
  const row = db
    .prepare(
      `SELECT m.allow_free, m.token_weight, m.upstream_id, m.group_slug,
              g.billing_mode AS group_billing_mode
       FROM models m
       LEFT JOIN model_groups g ON g.slug = m.group_slug
       WHERE m.id = ?`,
    )
    .get(modelId) as
    | Pick<
        ModelRow,
        | "allow_free"
        | "token_weight"
        | "upstream_id"
        | "group_slug"
        | "group_billing_mode"
      >
    | undefined;

  if (!row || accessFor(row) === "free") return false;

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
  const row = db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get(modelId) as ModelRow | undefined;

  return row ? toGatewayModel(row) : undefined;
}

/**
 * Resolves an unscoped upstream id only when exactly one provider publishes
 * it. Ambiguous ids must use the namespaced public id.
 */
export function getModelByUpstreamId(
  upstreamId: string,
): GatewayModel | undefined {
  const rows = db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.upstream_id = ?`,
    )
    .all(upstreamId) as ModelRow[];

  return rows.length === 1 ? toGatewayModel(rows[0]) : undefined;
}

/**
 * Upserts one provider's catalog. Manual sell prices, manual costs, operator
 * disables, and rows that vanished upstream are preserved; vanished rows are
 * marked `in_catalog = 0` rather than deleted, and only for this provider.
 */
export function replaceModels(
  rows: SyncedModel[],
  markupBps: number,
  upstreamSlug: string,
) {
  const existing = new Map<string, ModelRow>();

  for (const row of db.prepare("SELECT * FROM models").all() as ModelRow[]) {
    existing.set(row.id, row);
  }

  const groupModes = new Map<string, ModelAccess>();

  for (const row of db
    .prepare("SELECT slug, billing_mode FROM model_groups")
    .all() as Array<{ slug: string; billing_mode: ModelAccess }>) {
    groupModes.set(row.slug, row.billing_mode);
  }

  const upsert = db.prepare(`
    INSERT INTO models
      (id, upstream_id, upstream_slug, name, provider, family, protocol,
       cost_source, context_window, token_weight, input_price_micros,
       output_price_micros, sell_input_micros, sell_output_micros,
       price_source, in_catalog, allow_free, group_slug, group_source,
       supports_tools, supports_vision, health, status, sort_order, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      upstream_id = excluded.upstream_id,
      upstream_slug = excluded.upstream_slug,
      name = excluded.name,
      provider = excluded.provider,
      family = excluded.family,
      protocol = excluded.protocol,
      cost_source = excluded.cost_source,
      context_window = excluded.context_window,
      token_weight = excluded.token_weight,
      input_price_micros = excluded.input_price_micros,
      output_price_micros = excluded.output_price_micros,
      sell_input_micros = excluded.sell_input_micros,
      sell_output_micros = excluded.sell_output_micros,
      price_source = excluded.price_source,
      in_catalog = 1,
      allow_free = excluded.allow_free,
      group_slug = excluded.group_slug,
      group_source = excluded.group_source,
      supports_tools = excluded.supports_tools,
      supports_vision = excluded.supports_vision,
      health = excluded.health,
      sort_order = excluded.sort_order,
      synced_at = excluded.synced_at
  `);

  const syncedAt = nowIso();

  db.transaction((models: SyncedModel[]) => {
    db.prepare("UPDATE models SET in_catalog = 0 WHERE upstream_slug = ?").run(
      upstreamSlug,
    );

    for (const model of models) {
      const current = existing.get(model.id);
      const defaultSlug = defaultGroupSlug({
        allowFree: model.allowFree,
        tokenWeight: model.tokenWeight,
        upstreamId: model.upstreamId,
      });
      const manualGroupSlug =
        current?.group_source === "manual" ? current.group_slug : null;
      let groupSlug = manualGroupSlug ?? defaultSlug;
      let groupSource: "auto" | "manual" = manualGroupSlug ? "manual" : "auto";

      if (!groupModes.has(groupSlug)) {
        groupSlug = defaultSlug;
        groupSource = "auto";
      }

      const isFree = groupModes.get(groupSlug) === "free";
      const keepManualSell = current?.price_source === "manual";
      const keepManualCost = current?.cost_source === "manual";
      const costInput = keepManualCost
        ? current.input_price_micros
        : model.costInputMicros;
      const costOutput = keepManualCost
        ? current.output_price_micros
        : model.costOutputMicros;
      const costSource = keepManualCost ? "manual" : model.costSource;
      const sellInput = isFree
        ? 0
        : keepManualSell
          ? current.sell_input_micros
          : defaultSellMicros(costInput, markupBps);
      const sellOutput = isFree
        ? 0
        : keepManualSell
          ? current.sell_output_micros
          : defaultSellMicros(costOutput, markupBps);

      upsert.run(
        model.id,
        model.upstreamId,
        model.upstreamSlug,
        model.name,
        model.family,
        model.family,
        model.protocol,
        costSource,
        model.contextWindow,
        model.tokenWeight,
        costInput,
        costOutput,
        sellInput,
        sellOutput,
        keepManualSell ? "manual" : "auto",
        model.allowFree ? 1 : 0,
        groupSlug,
        groupSource,
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
    .prepare(
      `${MODEL_SELECT}
       WHERE m.in_catalog = 1`,
    )
    .all() as ModelRow[];
  const update = db.prepare(
    `UPDATE models
     SET sell_input_micros = ?, sell_output_micros = ?, price_source = 'auto'
     WHERE id = ?`,
  );

  let changed = 0;

  db.transaction(() => {
    for (const row of rows) {
      if (accessFor(row) === "free") {
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
