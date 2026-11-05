import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentMatchingPolicy,
  MatchingSave,
} from "../matching-policy.ts";

import {
  defaultMatchingPolicy,
  MATCHING_SETTINGS_KEY,
  parseMatchingPolicy,
  validateMatchingPatch,
} from "../matching-policy.ts";
import { getSetting, saveSetting } from "../../storage/store/settings.ts";

export type MatchingRead = {
  policy: ContentMatchingPolicy;
  error: string | null;
};

export async function readMatchingPolicy(
  db: PostgresDatabase,
): Promise<MatchingRead> {
  const parsed = parseMatchingPolicy(
    await getSetting(db, MATCHING_SETTINGS_KEY),
  );

  if (parsed.ok) return { policy: parsed.policy, error: null };

  // A corrupt row must not turn on automatic publication or widen aliases.
  return { policy: defaultMatchingPolicy(), error: parsed.error };
}

/**
 * Lock the settings row for the compare-and-swap, then increment the revision.
 * The caller queues the stored-content rematch after this commits.
 */
export async function saveMatchingPolicy(
  db: PostgresDatabase,
  input: Record<string, unknown>,
): Promise<MatchingSave> {
  return db.transaction<MatchingSave>(async () => {
    const fallback = JSON.stringify(defaultMatchingPolicy());

    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO NOTHING`,
      [MATCHING_SETTINGS_KEY, fallback, new Date().toISOString()],
    );

    const stored = await db.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = ? FOR UPDATE`,
      [MATCHING_SETTINGS_KEY],
    );
    const parsed = parseMatchingPolicy(stored[0]?.value ?? null);

    if (!parsed.ok) {
      return { ok: false, status: 400, error: parsed.error };
    }

    const validated = validateMatchingPatch(parsed.policy, input);

    if (!validated.ok) return validated;

    const next: ContentMatchingPolicy = {
      ...validated.policy,
      revision: parsed.policy.revision + 1,
    };

    await saveSetting(db, MATCHING_SETTINGS_KEY, JSON.stringify(next));

    return { ok: true, policy: next };
  })();
}
