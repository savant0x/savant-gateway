import type { ProviderCatalogSummary } from "@/lib/provider-catalog";

import { Card } from "@heroui/react";

import { LocalTime } from "@/components/local-time";
import { ProviderSyncButton } from "@/components/provider-sync";
import { providersDue, syncIntervalMs } from "@/lib/provider-sync-policy";

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
  const due = new Set(providersDue(providers, now, interval));

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Sync and boundaries</Card.Title>
        <Card.Description>
          AIO sync runs balance, subscription and catalog for every enabled
          provider. A scheduler runs the same due policy in the background. Sync
          preserves operator disables, manual prices and delisted rows.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <ProviderSyncButton endpoint="admin" label="AIO sync" />
        <div className="space-y-3 text-xs text-muted">
          {providers.length === 0 ? (
            <p>No providers registered.</p>
          ) : (
            providers.map((provider) => (
              <div key={provider.slug} className="rounded-lg bg-surface p-2">
                <p>
                  <span className="text-foreground">{provider.label}</span>{" "}
                  <span className="mono text-[11px]">{provider.slug}</span>
                  {!provider.enabled ? (
                    <span className="text-muted"> · disabled</span>
                  ) : null}
                  {provider.enabled && !provider.configured ? (
                    <span className="text-muted"> · no key</span>
                  ) : null}
                  {due.has(provider.slug) ? (
                    <span className="text-warning"> · refresh due</span>
                  ) : null}
                </p>
                <p>
                  {provider.modelCount} synced · {provider.pricedCount} priced ·{" "}
                  {provider.unknownCostCount} without cost ·{" "}
                  {provider.servingCount} serving
                </p>
                <p>
                  {provider.enabled ? "enabled" : "disabled"} ·{" "}
                  {provider.configured ? "key present" : "no key"} · last sync{" "}
                  <LocalTime value={provider.syncedAt} />
                </p>
              </div>
            ))
          )}
          <p>
            Automatic sync:{" "}
            {interval === 0
              ? "off — catalogs refresh only from AIO sync"
              : `Vercel Hobby calls the scheduler daily; an enabled provider becomes due once its catalog is ${interval / 3_600_000}h old. A page render may refresh sooner.`}
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
