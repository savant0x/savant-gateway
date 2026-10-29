import type { UsageSummary } from "@/lib/types";

import { Card, Chip } from "@heroui/react";

import { StatusChip } from "./chips";
import { formatDate, formatMicros, formatNumber } from "./format";

export function UsageCard({ usage }: { usage: UsageSummary[] }) {
  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Recent usage</Card.Title>
            <Card.Description>
              One row per completed or attempted upstream call, including
              streamed completions. The charge is the settled debit.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {formatNumber(usage.length)} shown
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {usage.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            No requests yet. Create a key and use the tester above.
          </div>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model</th>
                  <th>Key</th>
                  <th>Tokens</th>
                  <th>Weighted</th>
                  <th>Charged</th>
                  <th>Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(row.createdAt)}
                    </td>
                    <td>
                      <div className="font-medium">
                        {row.modelName ?? row.modelId ?? "—"}
                      </div>
                      <div className="mono mt-0.5 text-[11px] text-muted">
                        {row.modelId ?? ""}
                      </div>
                    </td>
                    <td className="mono text-xs text-muted">
                      {row.keyPrefix ?? "—"}
                    </td>
                    <td className="text-muted">
                      {formatNumber(row.inputTokens)} /{" "}
                      {formatNumber(row.outputTokens)}
                    </td>
                    <td className="text-muted">
                      {formatNumber(row.weightedTokens)}
                    </td>
                    <td className="text-muted">
                      {formatMicros(row.chargedMicros)}
                    </td>
                    <td className="text-muted">
                      {formatNumber(row.latencyMs)} ms
                    </td>
                    <td>
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
