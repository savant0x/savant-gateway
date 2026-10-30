import type { ReactNode } from "react";
import type { BenchmarkSummary, ModelSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { buildCompareGroups } from "./compare-rows";

import { isBetter } from "@/lib/compare";

function ValueCell({
  value,
  better,
  hint,
}: {
  value: ReactNode;
  better: boolean;
  hint?: string;
}) {
  return (
    <td
      className={`compare-value${better ? " is-better" : ""}`}
      data-better={better ? "true" : undefined}
      title={hint}
    >
      {better ? (
        <i aria-hidden className="fa-solid fa-caret-right mr-1.5 text-accent" />
      ) : null}
      {value}
      {better ? <span className="sr-only"> (better)</span> : null}
    </td>
  );
}

/**
 * One attribute per line, both models on it. Every value is a stored
 * measurement; a missing one is a dash that says why, never a zero.
 */
export function CompareTable({
  left,
  right,
  benchmarks,
  comparisons,
}: {
  left: ModelSummary;
  right: ModelSummary;
  benchmarks: Record<string, BenchmarkSummary>;
  comparisons: Record<string, PriceComparison>;
}) {
  const groups = buildCompareGroups({ benchmarks, comparisons, left, right });

  return (
    <div className="mt-6 overflow-hidden rounded-md border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="data-table compare-table">
          <caption className="sr-only">
            {left.name} compared with {right.name}
          </caption>
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "35%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>{left.name}</th>
              <th>{right.name}</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.title}>
              <tr className="compare-group">
                <th colSpan={3} scope="rowgroup">
                  {group.title}
                </th>
              </tr>
              {group.rows
                .filter((row) => row.available !== false)
                .map((row) => (
                  <tr
                    key={`${group.title}-${row.label}`}
                    data-winner={row.winner ?? undefined}
                  >
                    <th scope="row" title={row.hint}>
                      {row.label}
                    </th>
                    <ValueCell
                      better={isBetter("left", row.winner ?? null)}
                      hint={row.hint}
                      value={row.left}
                    />
                    <ValueCell
                      better={isBetter("right", row.winner ?? null)}
                      hint={row.hint}
                      value={row.right}
                    />
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
