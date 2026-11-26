import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelAccess, SyncedModel } from "../../types.ts";
import type { ModelRow } from "../../projections.ts";

import { defaultGroupSlug } from "../../model-groups.ts";
import { defaultSellMicros } from "../../pricing.ts";
import { importedModelStatus } from "../../providers/catalog.ts";

import { reconcileRoutes } from "./routes.ts";

/**
 * Provider catalog sync, split from `./models.ts` for FID-085 step 4.
 *
 * The split is the 400-line ceiling, but it also lands on a real seam: this
 * module owns the one operation that rewrites the catalog wholesale, while
 * `./models.ts` owns reads and single-row pricing edits. Keeping a full-catalog
 * upsert in the same file as the admin reads hid how much destructive power sat
 * next to them.
 *
 * The preservation rules are unchanged and are the reason a sync is safe to run
 * on a schedule:
 *
 * 1. A manual sell price survives — the operator's price wins over markup.
 * 2. A manually entered cost survives, including its observation timestamp.
 * 3. A manual group assignment survives; a group that no longer exists falls
 *    back to the default rather than leaving a dangling reference.
 * 4. An operator disable survives; a row's status is never reset by a sync.
 * 5. A row that vanished upstream is delisted (`in_catalog = 0`), never deleted,
 *    and only for the provider being synced.
 *
 * Overrides are matched on `(upstream_slug, upstream_id)`, not on the published
 * id: a default-provider switch rewrites ids, and keying the lookup on `id`
 * would apply one model's manual group and prices to a different row
 * (FID-2026-1124-004). The preload is scoped to the provider for the same
 * reason it always should have been — a sync touches only its own rows.
 *
 * The upsert text is the one large statement that needed no dialect change:
 * `ON CONFLICT (id) DO UPDATE SET ... excluded.column` is spelled identically in
 * SQLite and PostgreSQL, so it moved across verbatim.
 *
 * The write is set-based: each row is still computed one at a time — every
 * preservation rule above runs per row — and the results flush as multi-row
 * upserts of 200, because one statement per model made a 600-row catalog a
 * multi-second lock-holding write (FID-2026-1124-005).
 */

/** 25 placeholders per row; 200 rows stays below any driver parameter limit. */
const UPSERT_CHUNK = 200;
const UPSERT_TUPLE =
  "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)";
const UPSERT_UPDATE = `ON CONFLICT (id) DO UPDATE SET
      upstream_id = excluded.upstream_id,
      upstream_slug = excluded.upstream_slug,
      route_group = excluded.route_group,
      name = excluded.name,
      provider = excluded.provider,
      family = excluded.family,
      protocol = excluded.protocol,
      cost_source = excluded.cost_source,
      context_window = excluded.context_window,
      input_price_micros = excluded.input_price_micros,
      output_price_micros = excluded.output_price_micros,
      sell_input_micros = excluded.sell_input_micros,
      sell_output_micros = excluded.sell_output_micros,
      price_source = excluded.price_source,
      in_catalog = 1,
      group_slug = excluded.group_slug,
      group_source = excluded.group_source,
      supports_tools = excluded.supports_tools,
      supports_vision = excluded.supports_vision,
      health = excluded.health,
      sort_order = excluded.sort_order,
      synced_at = excluded.synced_at`;

function upsertSql(rows: number) {
  return `INSERT INTO models
      (id, upstream_id, upstream_slug, name, provider, family, protocol,
       route_group, cost_source, context_window,
       input_price_micros, output_price_micros, sell_input_micros,
       sell_output_micros, price_source, in_catalog, group_slug,
       group_source, supports_tools, supports_vision, health, status,
       sort_order, synced_at)
    VALUES ${Array.from({ length: rows }, () => UPSERT_TUPLE).join(", ")}
    ${UPSERT_UPDATE}`;
}

export async function replaceModels(
  db: PostgresDatabase,
  models: SyncedModel[],
  markupBps: number,
  upstreamSlug: string,
) {
  const existing = new Map<string, ModelRow>();

  for (const row of await db
    .prepare("SELECT * FROM models WHERE upstream_slug = ?")
    .all<ModelRow>(upstreamSlug)) {
    existing.set(`${row.upstream_slug}\u0000${row.upstream_id}`, row);
  }

  const groupModes = new Map<string, ModelAccess>();

  for (const row of await db
    .prepare("SELECT slug, billing_mode FROM model_groups")
    .all<{ slug: string; billing_mode: ModelAccess }>()) {
    groupModes.set(row.slug, row.billing_mode);
  }

  const pending = new Map<string, unknown[]>();

  const syncedAt = new Date().toISOString();

  await db.transaction(async () => {
    await db
      .prepare("UPDATE models SET in_catalog = 0 WHERE upstream_slug = ?")
      .run(upstreamSlug);

    for (const model of models) {
      const current = existing.get(
        `${model.upstreamSlug}\u0000${model.upstreamId}`,
      );
      const defaultSlug = defaultGroupSlug({ upstreamId: model.upstreamId });
      const manualGroupSlug =
        current?.group_source === "manual" ? current.group_slug : null;
      let groupSlug = manualGroupSlug ?? defaultSlug;
      let groupSource: "auto" | "manual" = manualGroupSlug ? "manual" : "auto";

      if (!groupModes.has(groupSlug)) {
        groupSlug = defaultSlug;
        groupSource = "auto";
      }

      const keepManualSell = current?.price_source === "manual";
      const keepManualCost = current?.cost_source === "manual";
      const costInput = keepManualCost
        ? Number(current.input_price_micros)
        : model.costInputMicros;
      const costOutput = keepManualCost
        ? Number(current.output_price_micros)
        : model.costOutputMicros;
      const costSource = keepManualCost ? "manual" : model.costSource;
      const sellInput = keepManualSell
        ? Number(current.sell_input_micros)
        : defaultSellMicros(costInput, markupBps);
      const sellOutput = keepManualSell
        ? Number(current.sell_output_micros)
        : defaultSellMicros(costOutput, markupBps);
      // A row that arrives without a cost has nothing to sell yet. It waits in
      // the admin catalog as disabled instead of being published at $0.00 and
      // answering `503 model_unpriced` on every call.
      const status =
        current?.status ??
        importedModelStatus({ costSource: model.costSource });

      // Keyed by id so a repeated id keeps the last row, exactly as the
      // sequential upserts did, and one statement never affects a row twice.
      pending.set(model.id, [
        model.id,
        model.upstreamId,
        model.upstreamSlug,
        model.name,
        model.family,
        model.family,
        model.protocol,
        model.routeGroup,
        costSource,
        model.contextWindow,
        costInput,
        costOutput,
        sellInput,
        sellOutput,
        keepManualSell ? "manual" : "auto",
        groupSlug,
        groupSource,
        model.supportsTools ? 1 : 0,
        model.supportsVision ? 1 : 0,
        model.health,
        status,
        model.sortOrder,
        syncedAt,
      ]);
    }

    const rows = Array.from(pending.values());

    for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
      const batch = rows.slice(start, start + UPSERT_CHUNK);

      await db.prepare(upsertSql(batch.length)).run(...(batch.flat() as []));
    }
  })();

  await reconcileRoutes(db);
}
