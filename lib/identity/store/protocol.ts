import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { IdentityProtocolRecord } from "../types.ts";

import { PROTOCOL_ID } from "../battery.ts";
import { buildProtocol, verifyProtocol } from "../protocol.ts";

import { toProtocol, type ProtocolRow } from "./rows.ts";

export async function getProtocol(
  db: PostgresDatabase,
  id = PROTOCOL_ID,
): Promise<IdentityProtocolRecord | null> {
  const row = await db
    .prepare("SELECT * FROM identity.protocols WHERE id = ?")
    .get<ProtocolRow>(id);

  return row ? toProtocol(row) : null;
}

/**
 * Inserts the current protocol once, then re-verifies whatever is stored. A
 * changed battery with the same id is a mismatch, not a silent reuse.
 */
export async function ensureProtocol(
  db: PostgresDatabase,
  sealedAt = new Date().toISOString(),
): Promise<IdentityProtocolRecord> {
  const protocol = buildProtocol(sealedAt);

  await db
    .prepare(
      `INSERT INTO identity.protocols
        (id, version, probe_sha256, system_prompt_sha256, battery_json,
         sampling_json, normalizer_version, sealed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      protocol.id,
      protocol.version,
      protocol.probeSha256,
      protocol.systemPromptSha256,
      protocol.batteryJson,
      protocol.samplingJson,
      protocol.normalizerVersion,
      protocol.sealedAt,
    );

  const stored = await getProtocol(db, protocol.id);

  if (!stored) throw new Error("Identity protocol insert failed.");

  const check = verifyProtocol(stored);

  if (!check.ok) {
    throw new Error(`Identity protocol mismatch: ${check.reason}.`);
  }

  return stored;
}
