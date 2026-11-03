import type { MomentumEntry, MomentumMetric } from "@/lib/content/momentum";

import Link from "next/link";

import { formatCount, kindLabel } from "@/lib/content/format";
import { metricLabel } from "@/lib/content/momentum";

function signed(value: number): string {
  return value > 0
    ? `+${formatCount(value)}`
    : `−${formatCount(Math.abs(value))}`;
}

export function MomentumList({
  entries,
  metric,
  mode,
}: {
  entries: MomentumEntry[];
  metric: MomentumMetric;
  mode: "rising" | "movers";
}) {
  return (
    <div className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Piece</th>
            <th>Kind</th>
            <th>{metricLabel(metric)}</th>
            <th>{mode === "rising" ? "Gain" : "Change"}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.item.id}>
              <td className="font-mono text-xs text-muted">{index + 1}</td>
              <td>
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  href={`/signal/${encodeURIComponent(entry.item.id)}`}
                >
                  {entry.item.title}
                </Link>
                <p className="mt-0.5 text-[11px] text-muted">
                  {entry.item.sourceLabel}
                </p>
              </td>
              <td className="text-xs text-muted">
                {kindLabel(entry.item.kind)}
              </td>
              <td className="font-mono text-xs">
                {formatCount(entry.baseline)} → {formatCount(entry.current)}
              </td>
              <td
                className={`font-mono text-xs ${
                  entry.delta > 0 ? "text-success" : "text-danger"
                }`}
              >
                {signed(entry.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
