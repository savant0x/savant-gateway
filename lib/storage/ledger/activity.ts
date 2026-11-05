import type { ActivityInput } from "../../activity.ts";
import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { sanitizeActivityMetadata } from "../../activity.ts";

/**
 * Async activity insert (FID-085 step 3).
 *
 * The allowlist, the credential-refusal guard and the size limit are **not**
 * re-implemented here: `sanitizeActivityMetadata` is imported from
 * `lib/activity.ts`, so the portable version cannot drift from the live one.
 * Only the statement is new.
 */
export async function insertActivityOnce(
  db: PostgresDatabase,
  input: ActivityInput,
  key: string,
) {
  const row = await db
    .prepare(
      `INSERT INTO activity_events
        (id, user_id, actor, kind, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
    )
    .get<{ id: string }>(
      `act_${key}`,
      input.userId ?? null,
      input.actor ?? "system",
      input.kind,
      input.entityType,
      input.entityId ?? null,
      sanitizeActivityMetadata(input.metadata),
      input.now ?? new Date().toISOString(),
    );

  return Boolean(row);
}

export async function insertActivity(
  db: PostgresDatabase,
  input: ActivityInput,
) {
  const id = `act_${randomUUID()}`;

  await db
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
