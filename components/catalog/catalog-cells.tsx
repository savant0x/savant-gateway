import { formatPricePer1M } from "@/components/dashboard/format";

export type SortKey = "name" | "family" | "price-asc" | "price-desc";

export const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "family", label: "Family" },
  { key: "price-asc", label: "Input price ↑" },
  { key: "price-desc", label: "Input price ↓" },
];

/**
 * One rate when input and output cost the same, two when they differ. A zero
 * output rate is reported as a single input rate with a title, never as $0.
 */
export function RateCell({ input, output }: { input: number; output: number }) {
  const hasInput = input > 0;
  const hasOutput = output > 0;

  if (!hasInput && !hasOutput) return <span className="text-muted">—</span>;

  if (!hasOutput || input === output) {
    return (
      <span
        title={
          hasOutput
            ? "The same rate applies to input and output tokens"
            : "Upstream publishes no output rate for this model"
        }
      >
        {formatPricePer1M(hasInput ? input : output)}
      </span>
    );
  }

  return (
    <>
      <div>{formatPricePer1M(input)}</div>
      <div className="text-[11px] text-muted">{formatPricePer1M(output)}</div>
    </>
  );
}

/**
 * With 44 rows against a 456-entry public list, zero matches means the benchmark
 * could not be fetched, not that nothing overlaps. In that case the comparison
 * columns are hidden instead of printing "not listed" on every row.
 */
export function comparisonAvailable(matched: number, models: number) {
  return matched > 0 && models > 0;
}

export function formatDelta(bps: number | null) {
  if (bps === null) return "—";

  const percent = bps / 100;

  if (Math.abs(percent) < 0.1) return "≈ same";

  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toLocaleString(
    "en-US",
    { maximumFractionDigits: 1 },
  )}%`;
}

export function deltaClass(bps: number | null) {
  if (bps === null || Math.abs(bps) < 10) return "text-muted";

  return bps < 0 ? "text-success" : "text-danger";
}
