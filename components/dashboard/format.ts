const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : numberFormatter.format(value);
}

export function formatCompact(value: number | null | undefined) {
  return value == null ? "—" : compactFormatter.format(value);
}

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";

  return `$${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}`;
}

const calendarDayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

/**
 * A calendar date with its year, not an instant: "2026-09-22" is September 22
 * everywhere. Running it through a timezone would move it a day for half the
 * planet, so it is formatted in UTC and never localised.
 */
export function formatCalendarDay(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return calendarDayFormatter.format(date);
}

export function formatPricePer1M(value: number | null | undefined) {
  if (value == null) return "—";
  if (value === 0) return "$0.00";

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

/**
 * Exact micro-dollar rendering. A charge is an integer number of micros, so it
 * has at most six decimals; rounding to two printed $0.20 for a $0.195 charge
 * and $0.0000 for a real $0.000039 one. Two decimals is the floor, six the
 * ceiling, and trailing zeros are trimmed so ordinary balances stay readable.
 */
export function formatMicros(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";

  const micros = Math.round(value);
  const absolute = Math.abs(micros);
  const dollars = Math.floor(absolute / 1_000_000);
  const fraction = String(absolute % 1_000_000)
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");

  return `${micros < 0 ? "-" : ""}$${numberFormatter.format(dollars)}.${fraction}`;
}

export function formatPreciseMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";

  return formatMicros(value * 1_000_000);
}

export function formatSignedMicros(value: number | null | undefined) {
  if (value == null) return "—";

  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${sign}${formatMicros(Math.abs(value))}`;
}

export function formatMarginPercent(bps: number | null | undefined) {
  if (bps == null) return "—";

  return `${(bps / 100).toFixed(1)}%`;
}

export function formatRatePercent(bps: number | null | undefined) {
  if (bps == null) return "—";

  return `${(bps / 100).toFixed(2)}%`;
}

export function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatUsage(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const usage = value as Record<string, unknown>;
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);

  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;

  return `${formatNumber(input || 0)} in · ${formatNumber(output || 0)} out`;
}

export async function responseError(response: Response) {
  const text = await response.text().catch(() => "");

  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
    };

    if (typeof parsed.error === "string") return parsed.error;

    return parsed.error?.message || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}
