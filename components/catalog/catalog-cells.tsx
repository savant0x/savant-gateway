import type { BenchmarkSummary, ModelAccess } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { formatPricePer1M } from "@/components/dashboard/format";

export type SortKey = "name" | "family" | "price-asc" | "price-desc";

export const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "family", label: "Family" },
  { key: "price-asc", label: "Input price ↑" },
  { key: "price-desc", label: "Input price ↓" },
];

/**
 * A zero rate is not always "no price". Twenty-one of forty-four catalog rows
 * bill through the free pool or a plan, where a per-token rate is meaningless —
 * printing "—" there read as missing data for the cheapest rows on the page.
 * The access mode names the zero instead.
 */
export function includedLabel(access: ModelAccess) {
  return access === "free"
    ? "Free pool"
    : access === "subscription"
      ? "In plan"
      : null;
}

/**
 * One rate when input and output cost the same, `input / output` on one line
 * when they differ. Stacking the two rates doubled every row's height for no
 * extra information; the slash keeps the pairing explicit and the title spells
 * out which is which. A zero output rate is a single input rate, never $0.
 */
export function RateCell({
  input,
  output,
  access,
}: {
  input: number;
  output: number;
  access: ModelAccess;
}) {
  const hasInput = input > 0;
  const hasOutput = output > 0;

  if (!hasInput && !hasOutput) {
    const included = includedLabel(access);

    return included ? (
      <span className="text-muted" title={includedBilling(access)}>
        {included}
      </span>
    ) : (
      <span className="text-muted">—</span>
    );
  }

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
    <span
      className="inline-flex items-baseline gap-1"
      title="Input / output, USD per 1M tokens"
    >
      {formatPricePer1M(input)}
      <span aria-hidden className="text-muted">
        /
      </span>
      <span className="text-muted">{formatPricePer1M(output)}</span>
    </span>
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

/** Why a zero rate is zero, for the cell's title. */
export function includedBilling(access: ModelAccess) {
  return access === "free"
    ? "Included in the free pool; usage is metered in weighted tokens, not dollars per 1M"
    : "Included in a subscription plan; usage is metered in weighted tokens, not dollars per 1M";
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

function pricePair(input: number, output: number) {
  // Mirrors RateCell: equal rates are one number, not "2.60 / 2.60".
  return input > 0 && output > 0 && input !== output
    ? `${formatPricePer1M(input)} / ${formatPricePer1M(output)}`
    : formatPricePer1M(input > 0 ? input : output);
}

function ourRate(
  savant: { input: number; output: number },
  access: ModelAccess,
) {
  const included =
    savant.input > 0 || savant.output > 0 ? null : includedLabel(access);

  return included
    ? `${included} (no per-token rate)`
    : pricePair(savant.input, savant.output);
}

/**
 * The comparison is one hover away instead of a permanent column: the catalog
 * shows our rate, and the tooltip carries the list rate and the id it came from.
 * Removing the column took 244 px of mostly-empty table away from the reader.
 */
export function priceProvenance(
  savant: { input: number; output: number },
  access: ModelAccess,
  comparison?: PriceComparison,
) {
  const ours = ourRate(savant, access);

  if (!comparison) {
    return `Savant: ${ours} per 1M tokens. No exact OpenRouter counterpart listed.`;
  }

  return `Savant: ${ours} per 1M tokens. OpenRouter list: ${pricePair(
    comparison.inputPer1M,
    comparison.outputPer1M,
  )} per 1M (${comparison.openRouterId}), blended ${formatDelta(
    comparison.blendedDeltaBps,
  )}.`;
}

export function formatIndex(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

/** Thinking models can take minutes to emit a first token; seconds alone read as a bug. */
export function formatLatency(seconds: number) {
  return seconds >= 90
    ? `${(seconds / 60).toFixed(1)} min to first token`
    : `${seconds.toFixed(2)} s to first token`;
}

/**
 * The cell shows one number; the provenance lives in the title. A score without
 * its index revision and measurement date becomes an assumption the moment it is
 * a week old, so both travel with it.
 */
export function benchmarkTitle(benchmark: BenchmarkSummary) {
  return [
    benchmark.intelligenceIndex === null
      ? null
      : `Intelligence Index ${formatIndex(benchmark.intelligenceIndex)}${
          benchmark.indexVersion ? ` (index v${benchmark.indexVersion})` : ""
        }`,
    benchmark.outputTokensPerSecond === null
      ? null
      : `${Math.round(benchmark.outputTokensPerSecond)} output tokens/s`,
    benchmark.ttftSeconds === null
      ? null
      : formatLatency(benchmark.ttftSeconds),
    benchmark.measuredAt
      ? `measured ${benchmark.measuredAt.slice(0, 10)} by Artificial Analysis`
      : "measured by Artificial Analysis",
    benchmark.stale ? "no longer in their current list" : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** A dash is "not measured", never zero. */
export function QualityCell({ benchmark }: { benchmark?: BenchmarkSummary }) {
  if (!benchmark) {
    return (
      <span className="text-muted" title="Not measured by Artificial Analysis">
        —
      </span>
    );
  }

  if (benchmark.intelligenceIndex === null) {
    return (
      <span
        className="text-muted"
        title={`No intelligence index; ${benchmarkTitle(benchmark)}`}
      >
        —
      </span>
    );
  }

  return (
    <span className="mono tabular-nums" title={benchmarkTitle(benchmark)}>
      {formatIndex(benchmark.intelligenceIndex)}
    </span>
  );
}
