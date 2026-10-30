import type { ReactNode } from "react";
import type { BenchmarkSummary, ModelAccess, ModelSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { betterSide, type CompareSide } from "@/lib/compare";
import { blendedPer1M } from "@/lib/price-comparison";
import {
  formatCalendarDay,
  formatPricePer1M,
} from "@/components/dashboard/format";
import {
  formatDelta,
  formatIndex,
  formatLatency,
} from "@/components/catalog/catalog-cells";

/**
 * The rows of the comparison, built once. Prices, list rates and benchmarks
 * all reduce to the same shape — a label, two values and, when one side is
 * genuinely better, which side that is — so the table component stays render
 * only and this module stays testable without a DOM.
 */
export type Row = {
  label: string;
  /** Why this side wins, or what a dash means. Rendered as the cell's title. */
  hint?: string;
  left: ReactNode;
  right: ReactNode;
  winner?: CompareSide | null;
  /** False when neither side was measured, so an all-dash row is dropped. */
  available?: boolean;
};

type Group = { title: string; rows: Row[] };

const dash = <span className="text-muted">—</span>;

function rate(value: number) {
  return value > 0 ? (
    `${formatPricePer1M(value)} / 1M`
  ) : (
    <span className="text-muted">Not priced</span>
  );
}

/**
 * Our own rate, where a zero means something other than "no price". A free-pool
 * model is included, not unpriced, and printing "Not priced" beside an Access
 * row that says Free contradicts the −100% delta three lines below it.
 */
function savantRate(value: number, access: ModelAccess) {
  if (value > 0) return `${formatPricePer1M(value)} / 1M`;

  if (access === "free") return <span className="text-muted">Free pool</span>;

  if (access === "subscription") {
    return <span className="text-muted">In plan</span>;
  }

  return <span className="text-muted">Not priced</span>;
}

/** `Free` beats `Free · free`: the group only earns its own words when it differs. */
function accessLabel(model: ModelSummary) {
  const label = model.groupLabel.trim();

  if (label && label.toLowerCase() !== model.access) {
    return `${label} · ${model.access}`;
  }

  return model.access.charAt(0).toUpperCase() + model.access.slice(1);
}

/** A release date: a calendar date, so it is never shifted into a timezone. */
function released(benchmark: BenchmarkSummary | null) {
  const value = benchmark?.releaseDate;

  return value ? formatCalendarDay(value) : dash;
}

/**
 * Provenance for a measured row: the source slug the numbers were matched on,
 * the index revision, and the measurement date when the source publishes one.
 * The old "Measured" row printed a dash on every row because this payload has
 * no per-model date, so it said nothing and looked like broken data.
 */
function source(benchmark: BenchmarkSummary | null) {
  if (!benchmark) return <span className="text-muted">Not measured</span>;

  const meta = [
    benchmark.indexVersion ? `v${benchmark.indexVersion}` : null,
    benchmark.measuredAt ? formatCalendarDay(benchmark.measuredAt) : null,
    benchmark.stale ? "stale" : null,
  ].filter(Boolean);

  return (
    <span className="inline-flex flex-col items-end gap-0.5 whitespace-nowrap">
      <span className="font-mono text-[11px]">
        {benchmark.sourceSlug ?? "—"}
      </span>
      {meta.length > 0 ? (
        <span className="text-[10px] text-muted">{meta.join(" · ")}</span>
      ) : null}
    </span>
  );
}

export function buildCompareGroups({
  left,
  right,
  benchmarks,
  comparisons,
}: {
  left: ModelSummary;
  right: ModelSummary;
  benchmarks: Record<string, BenchmarkSummary>;
  comparisons: Record<string, PriceComparison>;
}): Group[] {
  const leftBench = benchmarks[left.id] ?? null;
  const rightBench = benchmarks[right.id] ?? null;
  const leftList = comparisons[left.id] ?? null;
  const rightList = comparisons[right.id] ?? null;
  const showList = leftList !== null || rightList !== null;
  const showBench = leftBench !== null || rightBench !== null;
  const blend = (model: ModelSummary) =>
    blendedPer1M(model.inputPricePer1M, model.outputPricePer1M);

  const groups: Group[] = [
    {
      title: "Identity",
      rows: [
        {
          label: "Vendor",
          left: left.family,
          right: right.family,
        },
        {
          label: "Access",
          left: accessLabel(left),
          right: accessLabel(right),
        },
        {
          label: "Context window",
          left: left.contextWindow,
          right: right.contextWindow,
        },
        {
          label: "Released",
          hint: "Release date as published by Artificial Analysis",
          left: released(leftBench),
          right: released(rightBench),
          available: Boolean(leftBench?.releaseDate || rightBench?.releaseDate),
        },
        {
          label: "Token weight",
          hint: "Billing weight applied to usage on this plan",
          left: left.tokenWeight > 0 ? `${left.tokenWeight}×` : dash,
          right: right.tokenWeight > 0 ? `${right.tokenWeight}×` : dash,
        },
      ],
    },
    {
      title: "Savant price",
      rows: [
        {
          label: "Input, per 1M",
          hint: "Lower is cheaper",
          left: savantRate(left.inputPricePer1M, left.access),
          right: savantRate(right.inputPricePer1M, right.access),
          winner: betterSide(
            left.inputPricePer1M,
            right.inputPricePer1M,
            "lower",
          ),
        },
        {
          label: "Output, per 1M",
          hint: "Lower is cheaper",
          left: savantRate(left.outputPricePer1M, left.access),
          right: savantRate(right.outputPricePer1M, right.access),
          winner: betterSide(
            left.outputPricePer1M,
            right.outputPricePer1M,
            "lower",
          ),
        },
        {
          label: "3:1 blend, per 1M",
          hint: "Three prompt tokens to one completion token — the shape of agent traffic",
          left: savantRate(blend(left), left.access),
          right: savantRate(blend(right), right.access),
          winner: betterSide(blend(left), blend(right), "lower"),
        },
      ],
    },
  ];

  if (showList) {
    groups.push({
      title: "OpenRouter list",
      rows: [
        {
          label: "Input, per 1M",
          hint: leftList && rightList ? "Lower is cheaper" : undefined,
          left: leftList ? rate(leftList.inputPer1M) : dash,
          right: rightList ? rate(rightList.inputPer1M) : dash,
          winner:
            leftList && rightList
              ? betterSide(leftList.inputPer1M, rightList.inputPer1M, "lower")
              : null,
        },
        {
          label: "Output, per 1M",
          hint: leftList && rightList ? "Lower is cheaper" : undefined,
          left: leftList ? rate(leftList.outputPer1M) : dash,
          right: rightList ? rate(rightList.outputPer1M) : dash,
          winner:
            leftList && rightList
              ? betterSide(leftList.outputPer1M, rightList.outputPer1M, "lower")
              : null,
        },
        {
          label: "Savant vs list, blended",
          hint: "Negative means Savant is cheaper than the public list",
          left: leftList ? formatDelta(leftList.blendedDeltaBps) : dash,
          right: rightList ? formatDelta(rightList.blendedDeltaBps) : dash,
          winner:
            leftList && rightList
              ? betterSide(
                  leftList.blendedDeltaBps,
                  rightList.blendedDeltaBps,
                  "lower",
                )
              : null,
        },
        {
          label: "Matched list id",
          hint: "The exact public id the comparison was priced against",
          left: leftList ? (
            <span className="font-mono text-[11px]">
              {leftList.openRouterId}
            </span>
          ) : (
            dash
          ),
          right: rightList ? (
            <span className="font-mono text-[11px]">
              {rightList.openRouterId}
            </span>
          ) : (
            dash
          ),
        },
      ],
    });
  }

  groups.push({
    title: "Capabilities",
    rows: [
      {
        label: "Tools",
        left: left.supportsTools ? "Yes" : "No",
        right: right.supportsTools ? "Yes" : "No",
      },
      {
        label: "Vision",
        left: left.supportsVision ? "Yes" : "No",
        right: right.supportsVision ? "Yes" : "No",
      },
    ],
  });

  if (showBench) {
    const metric = (
      label: string,
      hint: string,
      pick: (benchmark: BenchmarkSummary) => number | null,
      format: (value: number) => string,
      direction: "lower" | "higher",
    ): Row => {
      const l = leftBench ? pick(leftBench) : null;
      const r = rightBench ? pick(rightBench) : null;

      return {
        label,
        hint,
        left: l == null ? dash : format(l),
        right: r == null ? dash : format(r),
        winner: betterSide(l, r, direction),
        // A row where neither side was measured is noise, not a comparison.
        available: l != null || r != null,
      };
    };

    groups.push({
      title: "AA Benchmark",
      rows: [
        metric(
          "Intelligence Index",
          "Higher is better",
          (benchmark) => benchmark.intelligenceIndex,
          (value) => formatIndex(value),
          "higher",
        ),
        metric(
          "Coding Index",
          "Higher is better · Artificial Analysis coding index",
          (benchmark) => benchmark.codingIndex,
          (value) => formatIndex(value),
          "higher",
        ),
        metric(
          "Agentic Index",
          "Higher is better · Artificial Analysis agentic index",
          (benchmark) => benchmark.agenticIndex,
          (value) => formatIndex(value),
          "higher",
        ),
        metric(
          "Time to first token",
          "Lower is better",
          (benchmark) => benchmark.ttftSeconds,
          (value) => formatLatency(value),
          "lower",
        ),
        metric(
          "Output speed",
          "Higher is better",
          (benchmark) => benchmark.outputTokensPerSecond,
          (value) => `${value.toFixed(1)} tok/s`,
          "higher",
        ),
        metric(
          "End-to-end response",
          "Lower is better · median response time for a full answer",
          (benchmark) => benchmark.endToEndSeconds,
          (value) =>
            value >= 90
              ? `${(value / 60).toFixed(1)} min`
              : `${value.toFixed(2)} s`,
          "lower",
        ),
        {
          label: "Source",
          hint: "The Artificial Analysis record these numbers came from",
          left: source(leftBench),
          right: source(rightBench),
        },
      ],
    });
  }

  return groups;
}
