import type { ProviderStatus } from "@/lib/types";

import { Card } from "@heroui/react";

import { StatusChip } from "./chips";
import { formatCompact, formatMoney, formatNumber } from "./format";

import { LocalTime } from "@/components/local-time";

export function ProviderCard({ provider }: { provider: ProviderStatus }) {
  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Provider</Card.Title>
            <Card.Description>
              Live state from the upstream provider. Free models share the
              provider key&apos;s pool.
            </Card.Description>
          </div>
          <StatusChip status={provider.status} />
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        {!provider.configured ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <p className="font-medium text-warning">Provider key missing</p>
            <p className="mt-1 text-muted">
              Add <code className="mono text-foreground">PROVIDER_KEY</code> to{" "}
              <code className="mono text-foreground">.env.local</code>, restart
              the server, and press Sync provider.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Balance</p>
            <p className="mt-1 text-lg font-semibold">
              {formatMoney(provider.balanceUsd)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">RPM</p>
            <p className="mt-1 text-lg font-semibold">
              {formatNumber(provider.rpm)}{" "}
              <span className="text-xs font-normal text-muted">
                {provider.rpmPlan ?? ""}
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Free pool remaining</p>
            <p className="mt-1 text-lg font-semibold">
              {formatCompact(provider.subscriptionTokensRemaining)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Upstream subscription quota</p>
            <p className="mt-1 text-lg font-semibold">
              {provider.subscriptionMode ?? "—"}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted">
          <p>
            Pool used: {formatCompact(provider.subscriptionTokensUsed)} /{" "}
            {formatCompact(provider.subscriptionTokenLimit)} weighted tokens
          </p>
          {provider.subscriptionExpiresAt ? (
            <p>
              Upstream quota expires:{" "}
              <LocalTime value={provider.subscriptionExpiresAt} />
            </p>
          ) : null}
          {provider.error ? (
            <p className="text-warning">{provider.error}</p>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
