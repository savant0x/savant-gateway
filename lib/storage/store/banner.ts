import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ContextBanner } from "../../context-banner.ts";

import {
  CONTEXT_BANNER_MAX_CHARS,
  normalizeBannerText,
  validateBannerText,
} from "../../context-banner.ts";

import { getSetting, saveSetting } from "./settings.ts";

/**
 * Context banner settings, ported to the async handle (FID-086, Batch B).
 *
 * The banner is injected into every completion and its characters are counted
 * against the customer's prompt tokens, so the text is validated on write and
 * normalized on read. A stored value that no longer passes validation (written
 * by an older revision) is truncated rather than served whole, so the token
 * estimate and the prompt agree.
 */

const TEXT_KEY = "gateway.context_banner.text";
const ENABLED_KEY = "gateway.context_banner.enabled";

export async function getBannerConfig(
  db: PostgresDatabase,
): Promise<ContextBanner> {
  const raw = (await getSetting(db, TEXT_KEY)) ?? "";
  const validated = validateBannerText(raw);
  const text = validated.ok
    ? validated.text
    : normalizeBannerText(raw).slice(0, CONTEXT_BANNER_MAX_CHARS);

  return {
    enabled: (await getSetting(db, ENABLED_KEY)) === "true",
    text,
  };
}

export async function saveBannerConfig(
  db: PostgresDatabase,
  input: { enabled?: boolean; text?: string },
): Promise<{ ok: true; banner: ContextBanner } | { ok: false; error: string }> {
  if (input.text !== undefined) {
    const validated = validateBannerText(input.text);

    if (!validated.ok) return { ok: false, error: validated.error };

    await saveSetting(db, TEXT_KEY, validated.text);
  }

  if (typeof input.enabled === "boolean") {
    await saveSetting(db, ENABLED_KEY, input.enabled ? "true" : "false");
  }

  return { ok: true, banner: await getBannerConfig(db) };
}
