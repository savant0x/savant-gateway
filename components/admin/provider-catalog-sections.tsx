import type { ProviderCatalogSummary } from "@/lib/provider-catalog";

import { Card, Chip } from "@heroui/react";

import { formatNumber } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";

export function ProviderCatalogSections({
  providers,
}: {
  providers: ProviderCatalogSummary[];
}) {
  if (providers.length === 0) return null;

  return (
    <section aria-labelledby="provider-catalog-heading" className="space-y-3">
      <div>
        <h2
          className="text-lg font-semibold tracking-[-0.02em]"
          id="provider-catalog-heading"
        >
          Catalog by provider
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          Every registered upstream and what it contributes. A model sold by
          more than one provider is published once and served by the cheapest;
          <span className="text-foreground"> serving </span>
          counts the published rows this provider answers right now.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.slug} variant="secondary">
            <Card.Header>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Card.Title>{provider.label}</Card.Title>
                  <p className="mono mt-1 text-[11px] text-muted">
                    {provider.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    color={provider.enabled ? "success" : "default"}
                    size="sm"
                    variant="soft"
                  >
                    {provider.enabled ? "enabled" : "disabled"}
                  </Chip>
                  <Chip
                    color={provider.configured ? "success" : "warning"}
                    size="sm"
                    variant="soft"
                  >
                    {provider.configured ? "key present" : "no key"}
                  </Chip>
                </div>
              </div>
            </Card.Header>
            <Card.Content className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p className="rounded-lg bg-surface p-2">
                  <span className="block text-lg font-semibold">
                    {formatNumber(provider.modelCount)}
                  </span>
                  synced models
                </p>
                <p className="rounded-lg bg-surface p-2">
                  <span className="block text-lg font-semibold">
                    {formatNumber(provider.activeCount)}
                  </span>
                  active in catalog
                </p>
                <p className="rounded-lg bg-surface p-2">
                  <span className="block text-lg font-semibold">
                    {formatNumber(provider.servingCount)}
                  </span>
                  serving now
                </p>
                <p className="rounded-lg bg-surface p-2">
                  <span className="block text-lg font-semibold">
                    {formatNumber(provider.pricedCount)}
                  </span>
                  priced
                </p>
              </div>

              {provider.modelCount === 0 ? (
                <p className="text-xs text-muted">
                  No models imported. Sync this provider to publish its catalog.
                </p>
              ) : null}
              {provider.unknownCostCount > 0 ? (
                <p className="text-xs text-warning">
                  {formatNumber(provider.unknownCostCount)}{" "}
                  {provider.unknownCostCount === 1
                    ? "model has"
                    : "models have"}{" "}
                  no known cost; they stay disabled until priced.
                </p>
              ) : null}
              <p className="text-[11px] text-muted">
                Last sync: <LocalTime value={provider.syncedAt} />
              </p>
            </Card.Content>
          </Card>
        ))}
      </div>
    </section>
  );
}
