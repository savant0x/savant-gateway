/**
 * Resumable source checkpoint (FID-2026-1104-015).
 *
 * A budget pause after the primary fetch stores the parsed items that have not
 * been written yet. The checkpoint is bound to `sources.config_revision`; any
 * source edit discards it rather than replaying items against new settings.
 */

import type { ParsedItem } from "./types.ts";

export const CHECKPOINT_VERSION = 1;
export const CHECKPOINT_MAX_BYTES = 2_000_000;

export type SourceCheckpoint = {
  version: number;
  revision: number;
  items: ParsedItem[];
  nextIndex: number;
  seen: number;
  skipped: number;
  upserted: number;
  startedAt: string;
};

export function serializeCheckpoint(
  checkpoint: SourceCheckpoint,
): string | null {
  const raw = JSON.stringify(checkpoint);

  return Buffer.byteLength(raw, "utf8") <= CHECKPOINT_MAX_BYTES ? raw : null;
}

export function parseCheckpoint(
  raw: string | null,
  revision: number,
): SourceCheckpoint | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;

    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.version !== CHECKPOINT_VERSION ||
      value.revision !== revision ||
      !Array.isArray(value.items) ||
      typeof value.nextIndex !== "number" ||
      !Number.isSafeInteger(value.nextIndex) ||
      value.nextIndex < 0 ||
      value.nextIndex > value.items.length ||
      typeof value.seen !== "number" ||
      !Number.isSafeInteger(value.seen) ||
      typeof value.skipped !== "number" ||
      !Number.isSafeInteger(value.skipped) ||
      value.skipped < 0 ||
      typeof value.upserted !== "number" ||
      !Number.isSafeInteger(value.upserted) ||
      value.upserted < 0 ||
      typeof value.startedAt !== "string"
    ) {
      return null;
    }

    return {
      version: CHECKPOINT_VERSION,
      revision,
      items: value.items as ParsedItem[],
      nextIndex: value.nextIndex,
      seen: value.seen,
      skipped: value.skipped,
      upserted: value.upserted,
      startedAt: value.startedAt,
    };
  } catch {
    return null;
  }
}
