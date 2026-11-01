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
 * The upsert text is the one large statement that needed no dialect change:
 * `ON CONFLICT (id) DO UPDATE SET ... excluded.column` is spelled identically in
 * SQLite and PostgreSQL, so it moved across verbatim.
 */
export async function replaceModels(
  db: PostgresDatabase,
  models: SyncedModel[],
  markupBps: number,
  upstreamSlug: string,
) {
  const existing = new Map<string, ModelRow>();

  for (const row of await db.prepare("SELECT * FROM models").all<ModelRow>()) {
    existing.set(row.id, row);
  }

  const groupModes = new Map<string, ModelAccess>();

  for (const row of await db
    .prepare("SELECT slug, billing_mode FROM model_groups")
    .all<{ slug: string; billing_mode: ModelAccess }>()) {
    groupModes.set(row.slug, row.billing_mode);
  }

  const upsert = db.prepare(`
    INSERT INTO models
      (id, upstream_id, upstream_slug, name, provider, family, protocol,
       route_group, cost_source, context_window, token_weight,
       input_price_micros, output_price_micros, sell_input_micros,
       sell_output_micros, price_source, in_catalog, allow_free, group_slug,
       group_source, supports_tools, supports_vision, health, status,
       sort_order, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      upstream_id = excluded.upstream_id,
      upstream_slug = excluded.upstream_slug,
      route_group = excluded.route_group,
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

  const syncedAt = new Date().toISOString();

  await db.transaction(async () => {
    await db
      .prepare("UPDATE models SET in_catalog = 0 WHERE upstream_slug = ?")
      .run(upstreamSlug);

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
        ? Number(current.input_price_micros)
        : model.costInputMicros;
      const costOutput = keepManualCost
        ? Number(current.output_price_micros)
        : model.costOutputMicros;
      const costSource = keepManualCost ? "manual" : model.costSource;
      const sellInput = isFree
        ? 0
        : keepManualSell
          ? Number(current.sell_input_micros)
          : defaultSellMicros(costInput, markupBps);
      const sellOutput = isFree
        ? 0
        : keepManualSell
          ? Number(current.sell_output_micros)
          : defaultSellMicros(costOutput, markupBps);
      // A row that arrives without a cost has nothing to sell yet. It waits in
      // the admin catalog as disabled instead of being published at $0.00 and
      // answering `503 model_unpriced` on every call.
      const status =
        current?.status ??
        importedModelStatus({ costSource: model.costSource, isFree });

      await upsert.run(
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
        status,
        model.sortOrder,
        syncedAt,
      );
    }
  })();

  await reconcileRoutes(db);
}
