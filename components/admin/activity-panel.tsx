import type { ActivitySummary } from "@/lib/activity";

import { Card } from "@heroui/react";

import { LocalTime } from "@/components/local-time";

function metadataSummary(event: ActivitySummary) {
  if (!event.metadata) return "—";

  return Object.entries(event.metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

export function ActivityPanel({ events }: { events: ActivitySummary[] }) {
  return (
    <Card id="activity" variant="secondary">
      <Card.Header>
        <Card.Title>Lifecycle activity</Card.Title>
        <Card.Description>
          Signups, sign-ins, keys, credit grants, top-ups, and promo
          redemptions. Amounts and identifiers only — no prompts, completions,
          keys, or tokens.
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
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
