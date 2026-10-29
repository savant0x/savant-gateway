import "server-only";

import type { Overview, OverviewStats } from "../types";

import { db } from "../db";

import { listApiKeys } from "./keys";
import { listModels } from "./models";
import { getProviderStatus } from "./provider";
import { listUsage } from "./usage";

export function getOverviewStats(): OverviewStats {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM models) AS model_count,
        (SELECT COUNT(*) FROM models WHERE allow_free = 1 AND token_weight > 0) AS free_model_count,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS key_count,
        (SELECT COUNT(*) FROM usage_events) AS request_count,
        (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM usage_events) AS total_tokens`,
    )
    .get() as {
    model_count: number;
    free_model_count: number;
    key_count: number;
    request_count: number;
    total_tokens: number;
  };

  return {
    modelCount: row.model_count,
    freeModelCount: row.free_model_count,
    keyCount: row.key_count,
    requestCount: row.request_count,
    totalTokens: row.total_tokens,
  };
}

export function getOverview(): Overview {
  return {
    provider: getProviderStatus(),
    models: listModels(),
    keys: listApiKeys(),
    usage: listUsage(25),
    stats: getOverviewStats(),
  };
}
