"use client";

import type { ProviderStatus } from "@/lib/types";

import { Button, Card } from "@heroui/react";

import { StatusChip } from "./chips";
import { formatMoney, formatNumber } from "./format";
import { useProviderRuntime } from "./use-provider-runtime";

import { LocalTime } from "@/components/local-time";

export function ProviderCard({ provider }: { provider: ProviderStatus }) {
  const live = useProviderRuntime(provider);
  const value = live.provider;
  const quota = live.quotaCurrent ? value : null;
  const balance = live.balanceCurrent ? value : null;

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Provider</Card.Title>
            <Card.Description>
              Account values fetched from upstream on each check. The free
              sandbox pool is shared by the provider account.
            </Card.Description>
          </div>
          <StatusChip
            status={
              live.checking ? "checking" : (quota?.status ?? "unavailable")
            }
          />
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
              {formatMoney(balance?.balanceUsd)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">RPM</p>
            <p className="mt-1 text-lg font-semibold">
              {formatNumber(balance?.rpm)}{" "}
              <span className="text-xs font-normal text-muted">
                {balance?.rpmPlan ?? ""}
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Free pool remaining</p>
            <p className="mt-1 text-lg font-semibold">
              {quota?.quota.unlimited
                ? "Unlimited"
                : formatNumber(quota?.subscriptionTokensRemaining)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Upstream subscription quota</p>
            <p className="mt-1 text-lg font-semibold">
              {quota?.subscriptionMode ?? "Unavailable"}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted">
          <p>
            Pool used: {formatNumber(quota?.subscriptionTokensUsed)} /{" "}
            {quota?.quota.unlimited
              ? "Unlimited"
              : formatNumber(quota?.subscriptionTokenLimit)}{" "}
            weighted tokens
          </p>
          <p>
            Available for admission after local usage and holds:{" "}
            {quota?.quota.unlimited
              ? "Unlimited"
              : formatNumber(quota?.admissionRemainingTokens)}
          </p>
          {quota?.quota.checkedAt ? (
            <p>
              Account checked: <LocalTime value={quota.quota.checkedAt} />
            </p>
          ) : null}
          {quota?.quota.resetsAt ? (
            <p>
              Upstream resets: <LocalTime value={quota.quota.resetsAt} />
            </p>
          ) : null}
          {quota?.subscriptionExpiresAt ? (
            <p>
              Upstream quota expires:{" "}
              <LocalTime value={quota.subscriptionExpiresAt} />
            </p>
          ) : null}
          {!live.checking && !quota ? (
            <p className="text-warning">
              Current quota unavailable. A new upstream check is required.
            </p>
          ) : null}
          {live.error || value?.error ? (
            <p className="text-warning">{live.error ?? value?.error}</p>
          ) : null}
          <p>
            Checks every 15 seconds while visible. Figures clear while checking
            or unavailable.
          </p>
        </div>
        <Button
          isDisabled={live.checking}
          variant="secondary"
          onPress={() => void live.refresh()}
        >
          {live.checking ? "Checking upstream…" : "Check account now"}
        </Button>
      </Card.Content>
    </Card>
  );
}
