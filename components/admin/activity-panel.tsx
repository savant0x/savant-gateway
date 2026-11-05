import type { ActivityCount, ActivitySummary } from "@/lib/activity";

import { Card } from "@heroui/react";

import { LocalTime } from "@/components/local-time";

function metadataSummary(event: ActivitySummary) {
  if (!event.metadata) return "—";

  return Object.entries(event.metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function activityTotals(counts: ActivityCount[]) {
  const totals = new Map<string, number>();

  for (const row of counts) {
    totals.set(row.kind, (totals.get(row.kind) ?? 0) + row.count);
  }

  return Array.from(totals.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function ActivityPanel({
  events,
  counts,
}: {
  events: ActivitySummary[];
  counts: ActivityCount[];
}) {
  return (
    <Card id="activity" variant="secondary">
      <Card.Header>
        <Card.Title>Lifecycle activity</Card.Title>
        <Card.Description>
          Account lifecycle plus the discovery-to-inference funnel. Amounts and
          identifiers only — no prompts, completions, keys, or tokens.
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {counts.length > 0 ? (
          <div className="border-b border-black/10 px-5 py-3 dark:border-white/10">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Last 30 days by event
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activityTotals(counts).map(([kind, total]) => (
                <span
                  key={kind}
                  className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-muted dark:border-white/10"
                >
                  {kind}: {total}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {events.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">
            No lifecycle events recorded yet.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Customer</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap text-muted">
                      <LocalTime value={event.createdAt} />
                    </td>
                    <td>
                      <div className="mono text-xs">{event.kind}</div>
                      <div className="text-[11px] text-muted">
                        {event.actor} · {event.entityType}
                        {event.entityId
                          ? ` ${event.entityId.slice(0, 18)}`
                          : ""}
                      </div>
                    </td>
                    <td className="text-muted">
                      {event.userEmail ?? event.userId ?? "system"}
                    </td>
                    <td className="text-xs text-muted">
                      {metadataSummary(event)}
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
