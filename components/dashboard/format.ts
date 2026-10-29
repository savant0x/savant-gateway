const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
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

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${dateFormatter.format(date)} UTC`;
}

export function formatPricePer1M(value: number | null | undefined) {
  if (value == null) return "—";
  if (value === 0) return "$0.00";

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

export function formatPreciseMoney(value: number | null | undefined) {
  if (value == null) return "—";

  const absolute = Math.abs(value);
  const digits = absolute > 0 && absolute < 0.01 ? 4 : 2;

  return `$${value.toFixed(digits)}`;
}

export function formatMicros(value: number | null | undefined) {
  return formatPreciseMoney(value == null ? null : value / 1_000_000);
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
