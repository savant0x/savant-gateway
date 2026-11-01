import { CONTEXT_DEPTHS } from "./battery.ts";

const WINDOW = /^(\d+(?:\.\d+)?)\s*([KM])?$/;

/**
 * Accepts the catalog's display forms: `128K`, `200K`, `1M`, `8192`,
 * `128,000`. Anything else is unparseable and the gate is `not_tested` rather
 * than guessed.
 */
export function parseContextWindow(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = value.trim().toUpperCase().replace(/,/g, "");
  const match = WINDOW.exec(cleaned);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  const tokens =
    unit === "K"
      ? Math.round(amount * 1_000)
      : unit === "M"
        ? Math.round(amount * 1_000_000)
        : Math.round(amount);

  return Number.isSafeInteger(tokens) && tokens > 0 ? tokens : null;
}

/**
 * The three fixed depths, limited to the advertised window. A window smaller
 * than the first step is tested at that window, never above it.
 */
export function contextDepths(advertised: number | null) {
  if (advertised === null || advertised <= 0) return [] as number[];

  const depths = CONTEXT_DEPTHS.filter((depth) => depth <= advertised);

  return depths.length > 0 ? [...depths] : [advertised];
}
