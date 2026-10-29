import "server-only";

import type { UsageSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

import {
  type AuthenticatedKey,
  type GatewayModel,
  type UsageRow,
  toUsageSummary,
} from "./shared";

export function recordUsage(input: {
  auth: AuthenticatedKey;
  model: GatewayModel;
  inputTokens: number;
  outputTokens: number;
  status: "ok" | "error" | "cancelled";
  latencyMs: number;
  error?: string | null;
}) {
  const inputTokens = Math.max(0, Math.floor(input.inputTokens));
  const outputTokens = Math.max(0, Math.floor(input.outputTokens));
  const totalTokens = inputTokens + outputTokens;
  const weightedTokens =
    input.model.allowFree && input.model.tokenWeight > 0
      ? totalTokens * Math.max(1, input.model.tokenWeight)
      : 0;
  const costMicros = Math.round(
    (inputTokens * input.model.inputPriceMicros +
      outputTokens * input.model.outputPriceMicros) /
      1_000_000,
  );

  db.prepare(
    `INSERT INTO usage_events
      (id, user_id, api_key_id, model_id, input_tokens, output_tokens,
       weighted_tokens, cost_micros, status, latency_ms, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `usage_${randomUUID()}`,
    input.auth.userId,
    input.auth.keyId,
    input.model.id,
    inputTokens,
    outputTokens,
    weightedTokens,
    costMicros,
    input.status,
    Math.max(0, Math.floor(input.latencyMs)),
    input.error?.slice(0, 500) ?? null,
    nowIso(),
  );
}

export function listUsage(limit = 25): UsageSummary[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
              u.input_tokens, u.output_tokens, u.weighted_tokens, u.cost_micros,
              u.status, u.latency_ms, u.error, u.created_at
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       LEFT JOIN api_keys k ON k.id = u.api_key_id
       ORDER BY datetime(u.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as UsageRow[];

  return rows.map(toUsageSummary);
}
