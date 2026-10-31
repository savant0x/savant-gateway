import type { ProviderCatalogSummary } from "@/lib/provider-catalog";

import { Card } from "@heroui/react";

import { LocalTime } from "@/components/local-time";
import { ProviderSyncButton } from "@/components/provider-sync";
import { syncIntervalMs } from "@/lib/provider-sync-policy";

/**
 * Live provider state, not a snapshot of the last sync response. Every number
 * is read from the same rows the gateway serves, so "serving" means the
 * provider answers that published model right now.
 */
export function ProviderSyncCard({
  providers,
  pricing,
}: {
  providers: Array<ProviderCatalogSummary & { keyEnvVar: string }>;
  pricing: { markupBps: number; pricedCount: number; unpricedCount: number };
}) {
  const interval = syncIntervalMs(process.env.PROVIDER_SYNC_INTERVAL_HOURS);
  const now = Date.now();
  const overdue = (syncedAt: string | null) => {
    if (interval === 0) return false;
    if (!syncedAt) return true;

    const at = Date.parse(syncedAt);

    return !Number.isFinite(at) || now - at >= interval;
  };

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Sync and boundaries</Card.Title>
        <Card.Description>
          Every enabled provider syncs on its own: balance, subscription and
          catalog where the upstream publishes them. Sync preserves operator
          disables, manual prices and delisted rows.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <ProviderSyncButton label="Sync every enabled provider" />
        <div className="space-y-3 text-xs text-muted">
          {providers.length === 0 ? (
            <p>No providers registered.</p>
          ) : (
            providers.map((provider) => (
              <div key={provider.slug} className="rounded-lg bg-surface p-2">
                <p>
                  <span className="text-foreground">{provider.label}</span>{" "}
                  <span className="mono text-[11px]">{provider.slug}</span>
                  {overdue(provider.syncedAt) ? (
                    <span className="text-warning"> · sync overdue</span>
                  ) : null}
                </p>
                <p>
                  {provider.modelCount} synced · {provider.pricedCount} priced ·{" "}
                  {provider.unknownCostCount} without cost ·{" "}
                  {provider.servingCount} serving
                </p>
                <p>
                  {provider.configured ? "key present" : "no key"} · last sync{" "}
                  <LocalTime value={provider.syncedAt} />
                </p>
              </div>
            ))
          )}
          <p>
            Automatic sync:{" "}
            {interval === 0
              ? "off — catalogs refresh only from this button"
              : `an enabled provider re-syncs once its catalog is ${interval / 3_600_000}h old`}
            .
          </p>
          <p>
            Pricing:{" "}
            <span className="text-foreground">
              {(pricing.markupBps / 100).toFixed(0)}% default markup
            </span>{" "}
            · {pricing.pricedCount} auto/manual rows priced
          </p>
          {pricing.unpricedCount > 0 ? (
            <p className="text-warning">
              {pricing.unpricedCount} non-free{" "}
              {pricing.unpricedCount === 1 ? "model has" : "models have"} no
              sell price. The catalog does not publish them and the gateway
              cannot bill them until a price is set.
            </p>
          ) : null}
          <p>
            A provider with no balance endpoint has no observable reserve; its
            calls fail when the wallet is empty.
          </p>
          <p>
            Session: signed HttpOnly cookie, eight-hour expiry, SameSite Strict.
          </p>
        </div>
      </Card.Content>
    </Card>
  );
}
