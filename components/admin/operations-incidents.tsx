"use client";

import type { OperationsIncident } from "@/lib/operations";
import type { OperationsOverview } from "./operations-overview";

import { Button, Card, Chip } from "@heroui/react";

import { LocalTime } from "@/components/local-time";

export function OperationsIncidents({
  incidents,
  busy,
  onAcknowledge,
}: {
  incidents: OperationsIncident[];
  busy: string | null;
  onAcknowledge: (id: string) => void;
}) {
  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Incidents</Card.Title>
        <Card.Description>
          Open conditions are deduplicated by fingerprint. Acknowledgment is
          attribution, not resolution; the condition clears only when the
          monitor no longer sees it. Delivery attempts and errors are recorded
          here.
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {incidents.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">
            No incidents recorded. Run the monitor to evaluate the current
            snapshot.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>State</th>
                  <th>Delivery</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <div className="font-medium">{incident.title}</div>
                      <div className="max-w-xl text-[11px] leading-5 text-muted">
                        {incident.detail}
                      </div>
                      <div className="mt-1 text-[10px] text-muted">
                        {incident.fingerprint}
                      </div>
                    </td>
                    <td>
                      <Chip
                        color={
                          incident.status === "open" ? "warning" : "success"
                        }
                        size="sm"
                      >
                        {incident.status}
                      </Chip>
                      <div className="mt-1 text-[10px] text-muted">
                        {incident.severity}
                      </div>
                    </td>
                    <td className="text-xs">
                      <Chip
                        color={
                          incident.deliveryState === "delivered"
                            ? "success"
                            : incident.deliveryState === "failed"
                              ? "danger"
                              : "default"
                        }
                        size="sm"
                      >
                        {incident.deliveryState}
                      </Chip>
                      <div className="mt-1 text-[10px] text-muted">
                        {incident.deliveryAttempts} attempt(s) ·{" "}
                        {incident.deliveryKind}
                      </div>
                      {incident.lastDeliveryError ? (
                        <div className="mt-1 max-w-xs text-[10px] text-danger">
                          {incident.lastDeliveryError}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-xs text-muted">
                      <LocalTime value={incident.lastSeen} />
                      <div>
                        {incident.acknowledgedAt ? (
                          <>
                            acknowledged{" "}
                            <LocalTime value={incident.acknowledgedAt} />
                          </>
                        ) : (
                          "unacknowledged"
                        )}
                      </div>
                    </td>
                    <td>
                      {incident.status === "open" &&
                      !incident.acknowledgedAt ? (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() => onAcknowledge(incident.id)}
                        >
                          Acknowledge
                        </Button>
                      ) : null}
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

export function OperationsProviders({
  providers,
  busy,
  onToggle,
}: {
  providers: OperationsOverview["providers"];
  busy: string | null;
  onToggle: (provider: OperationsOverview["providers"][number]) => void;
}) {
  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Providers</Card.Title>
        <Card.Description>
          Disabling a provider removes its models from admission. This is
          independent of admission pause and does not refund or modify existing
          holds.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.slug}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 dark:border-white/10"
          >
            <div>
              <p className="text-sm font-medium">{provider.label}</p>
              <p className="text-[11px] text-muted">
                {provider.slug} · {provider.status} ·{" "}
                {provider.enabled ? "enabled" : "disabled"}
              </p>
            </div>
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={() => onToggle(provider)}
            >
              {provider.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
