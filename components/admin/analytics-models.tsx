import type { AnalyticsModel } from "@/lib/types";

import {
  formatCompact,
  formatMarginPercent,
  formatMicros,
  formatNumber,
  formatSignedMicros,
} from "@/components/dashboard/format";

function marginPercent(row: AnalyticsModel) {
  if (row.chargedMicros <= 0) return null;

  return Math.round(
    ((row.chargedMicros - row.costMicros) / row.chargedMicros) * 10_000,
  );
}

export function AnalyticsModels({ models }: { models: AnalyticsModel[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
      <div className="border-b border-black/10 p-5 dark:border-white/10">
        <h2 className="text-sm font-semibold">Top models by credit revenue</h2>
        <p className="mt-1 text-xs text-muted">
          Twelve highest-charging models in the selected range. Plan invoice
          cash is not attributable to a model.
        </p>
      </div>

      {models.length === 0 ? (
        <p className="p-6 text-sm text-muted">
          No usage rows in this range. Run a call from the console or send one
          through the API.
        </p>
      ) : (
        <div className="scroll-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Family</th>
                <th className="text-right">Requests</th>
                <th className="text-right">Tokens</th>
                <th className="text-right">Credit revenue</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row) => {
                const margin = row.chargedMicros - row.costMicros;

                return (
                  <tr key={row.modelId}>
                    <td className="max-w-[20rem]">
                      <div className="truncate font-medium">
                        {row.modelName}
                      </div>
                      <div className="mono mt-0.5 truncate text-[11px] text-muted">
                        {row.modelId}
                      </div>
                    </td>
                    <td className="text-muted">{row.family}</td>
                    <td className="text-right">{formatNumber(row.requests)}</td>
                    <td className="text-right text-muted">
                      {formatCompact(row.tokens)}
                    </td>
                    <td className="text-right">
                      {formatMicros(row.chargedMicros)}
                    </td>
                    <td className="text-right text-muted">
                      {formatMicros(row.costMicros)}
                    </td>
                    <td
                      className={`text-right ${
                        margin >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {formatSignedMicros(margin)}
                    </td>
                    <td className="text-right text-muted">
                      {formatMarginPercent(marginPercent(row))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
