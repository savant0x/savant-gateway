import { Card, Chip } from "@heroui/react";

import {
  ADMISSION_COPY,
  admissionColor,
  type OperationsOverview,
} from "./operations-overview";

import {
  formatMicros,
  formatNumber,
  formatRatePercent,
} from "@/components/dashboard/format";

export function OperationsCards({
  overview,
}: {
  overview: OperationsOverview;
}) {
  const { snapshot } = overview;

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Admission
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Chip color={admissionColor(overview.admission.state)} size="sm">
              {overview.admission.state}
            </Chip>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            {ADMISSION_COPY[overview.admission.state]}
          </p>
          {overview.admission.reason ? (
            <p className="mt-2 text-xs text-foreground">
              Reason: {overview.admission.reason}
            </p>
          ) : null}
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Traffic · {snapshot.windowMinutes}m
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {snapshot.traffic.noTraffic
              ? "No traffic"
              : formatRatePercent(snapshot.traffic.errorRateBps)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {snapshot.traffic.noTraffic
              ? "No calls in this window; this is not a healthy zero."
              : `${formatNumber(snapshot.traffic.errors)} failed of ${formatNumber(snapshot.traffic.requests)} calls`}
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Unresolved settlements
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatNumber(snapshot.settlements.admitted)}
          </p>
          <p className="mt-1 text-xs text-muted">
            oldest{" "}
            {snapshot.settlements.oldestUnresolvedAgeSeconds === null
              ? "—"
              : `${formatNumber(Math.floor(snapshot.settlements.oldestUnresolvedAgeSeconds / 60))} min`}
            {" · "}
            {formatNumber(snapshot.settlements.quarantined)} quarantined
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Payment events
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatNumber(
              snapshot.payments.failed + snapshot.payments.quarantined,
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            failed or quarantined · {formatNumber(snapshot.payments.claimed)}{" "}
            claimed
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Provider quota
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatNumber(snapshot.quota.current)} /{" "}
            {formatNumber(snapshot.quota.enabledProviders)}
          </p>
          <p className="mt-1 text-xs text-muted">
            current · {formatNumber(snapshot.quota.stale)} stale ·{" "}
            {formatNumber(snapshot.quota.unknown)} unknown ·{" "}
            {formatNumber(snapshot.quota.errored)} error
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Held and quarantined
          </p>
          <p className="mt-2 text-xl font-semibold">
            {formatMicros(snapshot.money.heldMicros)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatMicros(snapshot.money.quarantinedMicros)} quarantined ·{" "}
            {formatMicros(snapshot.money.customerCreditMicros)} customer credit
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Storage
          </p>
          <p className="mt-2 text-xl font-semibold">
            {formatNumber(snapshot.storage.databaseBytes)} bytes
          </p>
          <p className="mt-1 text-xs text-muted">
            {snapshot.storage.backupCount === 0
              ? "no backup visible"
              : `${formatNumber(snapshot.storage.backupCount)} backup(s), newest ${formatNumber(snapshot.storage.backupAgeSeconds)}s ago`}
          </p>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Content className="pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Alert delivery
          </p>
          <p className="mt-2 text-sm font-medium">
            {overview.transport.configured
              ? "Webhook configured"
              : "Not configured"}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            {overview.transport.problem ??
              "Incidents are delivered to the configured HTTPS endpoint."}
          </p>
        </Card.Content>
      </Card>
    </section>
  );
}
