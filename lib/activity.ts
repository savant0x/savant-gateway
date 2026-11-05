import type { DatabaseHandle } from "./schema/columns.ts";

import { randomUUID } from "node:crypto";

export const ACTIVITY_KINDS = [
  "customer.signup",
  "customer.login",
  "customer.logout",
  "customer.key_created",
  "customer.key_revoked",
  "credit.granted",
  "credit.adjusted",
  "topup.created",
  "topup.paid",
  "promo.created",
  "promo.redeemed",
  "first_completion",
  "content_model_click",
  "follow_created",
  "save_created",
  "briefing_return",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ActivityActor = "customer" | "admin" | "system";

export type ActivitySummary = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  actor: ActivityActor;
  kind: ActivityKind;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, string | number | boolean> | null;
  createdAt: string;
};

export type ActivityInput = {
  userId?: string | null;
  actor?: ActivityActor;
  kind: ActivityKind;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean>;
  now?: string;
};

const METADATA_KEYS = new Set([
  "amountMicros",
  "topupId",
  "keyId",
  "promoId",
  "codePrefix",
  "provider",
  "status",
  "adjustmentKind",
  "maxRedemptions",
  "source",
  "modelId",
  "contentId",
  "groupSlug",
]);

/** Refuses to serialize a value whose name suggests a credential or content. */
const FORBIDDEN_KEY =
  /(secret|token|password|authorization|api[_-]?key|prompt|completion)/i;
const MAX_METADATA_BYTES = 1_000;

export function sanitizeActivityMetadata(
  input: Record<string, string | number | boolean> | undefined,
) {
  if (!input) return null;

  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!METADATA_KEYS.has(key) || FORBIDDEN_KEY.test(key)) {
      throw new Error(`Activity metadata key "${key}" is not allowed.`);
    }

    if (typeof value === "string") {
      if (value.length > 200) {
        throw new Error(`Activity metadata "${key}" is too long.`);
      }
      result[key] = value;
      continue;
    }

    if (typeof value === "number" && Number.isSafeInteger(value)) {
      result[key] = value;
      continue;
    }

    if (typeof value === "boolean") {
      result[key] = value;
      continue;
    }

    throw new Error(`Activity metadata "${key}" must be a scalar.`);
  }

  const serialized = JSON.stringify(result);

  if (serialized.length > MAX_METADATA_BYTES) {
    throw new Error("Activity metadata exceeds the size limit.");
  }

  return serialized;
}

export function insertActivity(database: DatabaseHandle, input: ActivityInput) {
  const id = `act_${randomUUID()}`;

  database
    .prepare(
      `INSERT INTO activity_events
        (id, user_id, actor, kind, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId ?? null,
      input.actor ?? "system",
      input.kind,
      input.entityType,
      input.entityId ?? null,
      sanitizeActivityMetadata(input.metadata),
      input.now ?? new Date().toISOString(),
    );

  return id;
}

/**
 * Inserts at most one row for a caller-supplied key. The key becomes the
 * primary id, so a retry, replay or concurrent success cannot write a second
 * funnel marker.
 */
export function insertActivityOnce(
  database: DatabaseHandle,
  input: ActivityInput,
  key: string,
) {
  const result = database
    .prepare(
      `INSERT INTO activity_events
        (id, user_id, actor, kind, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      `act_${key}`,
      input.userId ?? null,
      input.actor ?? "system",
      input.kind,
      input.entityType,
      input.entityId ?? null,
      sanitizeActivityMetadata(input.metadata),
      input.now ?? new Date().toISOString(),
    );

  return result.changes > 0;
}

/**
 * Login and logout must not be blocked by an audit write. The caller decides:
 * money and account changes use the throwing insert inside their transaction,
 * while session events use this best-effort wrapper.
 */
export function insertActivityBestEffort(
  database: DatabaseHandle,
  input: ActivityInput,
) {
  try {
    return insertActivity(database, input);
  } catch {
    return null;
  }
}

type ActivityRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  actor: string;
  kind: string;
  entity_type: string;
  entity_id: string | null;
  metadata: string | null;
  created_at: string;
};

export function queryActivity(
  database: DatabaseHandle,
  limit = 50,
  filters: { userId?: string; kind?: ActivityKind } = {},
): ActivitySummary[] {
  const bounded = Math.min(100, Math.max(1, Math.trunc(limit)));
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (filters.userId) {
    clauses.push("a.user_id = ?");
    values.push(filters.userId);
  }

  if (filters.kind) {
    clauses.push("a.kind = ?");
    values.push(filters.kind);
  }

  values.push(bounded);

  const rows = database
    .prepare(
      `SELECT a.id, a.user_id, u.email AS user_email, a.actor, a.kind,
              a.entity_type, a.entity_id, a.metadata, a.created_at
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.user_id
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(...values) as ActivityRow[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    actor: row.actor as ActivityActor,
    kind: row.kind as ActivityKind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: parseActivityMetadata(row.metadata),
    createdAt: row.created_at,
  }));
}

export type ActivityCount = {
  day: string;
  kind: ActivityKind;
  count: number;
};

/** Counts by UTC day and kind for the operator funnel. */
export function activityCounts(
  database: DatabaseHandle,
  input: { since: string; until: string },
): ActivityCount[] {
  const rows = database
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, kind, COUNT(*) AS total
         FROM activity_events
        WHERE created_at >= ? AND created_at < ?
        GROUP BY day, kind
        ORDER BY day ASC, kind ASC`,
    )
    .all(input.since, input.until) as Array<{
    day: string;
    kind: ActivityKind;
    total: number;
  }>;

  return rows.map((row) => ({
    day: row.day,
    kind: row.kind,
    count: Number(row.total),
  }));
}

export function parseActivityMetadata(
  value: string | null,
): Record<string, string | number | boolean> | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return null;

    return parsed as Record<string, string | number | boolean>;
  } catch {
    return null;
  }
}
