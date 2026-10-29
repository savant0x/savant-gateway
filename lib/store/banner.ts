import "server-only";

import type { ContextBanner } from "../context-banner";

import {
  CONTEXT_BANNER_MAX_CHARS,
  normalizeBannerText,
  validateBannerText,
} from "../context-banner";

import { getSetting, saveSetting } from "./settings";

const TEXT_KEY = "gateway.context_banner.text";
const ENABLED_KEY = "gateway.context_banner.enabled";

export function getBannerConfig(): ContextBanner {
  const raw = getSetting(TEXT_KEY) ?? "";
  const validated = validateBannerText(raw);
  const text = validated.ok
    ? validated.text
    : normalizeBannerText(raw).slice(0, CONTEXT_BANNER_MAX_CHARS);

  return {
    enabled: getSetting(ENABLED_KEY) === "true",
    text,
  };
}

export function saveBannerConfig(input: {
  enabled?: boolean;
  text?: string;
}): { ok: true; banner: ContextBanner } | { ok: false; error: string } {
  if (input.text !== undefined) {
    const validated = validateBannerText(input.text);

    if (!validated.ok) return { ok: false, error: validated.error };

    saveSetting(TEXT_KEY, validated.text);
  }

  if (typeof input.enabled === "boolean") {
    saveSetting(ENABLED_KEY, input.enabled ? "true" : "false");
  }

  return { ok: true, banner: getBannerConfig() };
}
