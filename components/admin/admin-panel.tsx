import type { AdminOverview, AnalyticsData } from "@/lib/types";

import { Card } from "@heroui/react";
import Link from "next/link";

import { CreditCard } from "./credit-card";

import { KeysCard } from "@/components/dashboard/keys-card";
import { ProviderCard } from "@/components/dashboard/provider-card";
import { StatCard } from "@/components/dashboard/chips";
import {
  formatCompact,
  formatMarginPercent,
  formatMicros,
  formatNumber,
} from "@/components/dashboard/format";
import { ProviderSyncButton } from "@/components/provider-sync";

function LinkButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs font-medium transition-colors hover:border-accent/40 dark:border-white/10"
      href={href}
    >
      <i aria-hidden className={`fa-solid ${icon} text-accent`} />
      {label}
    </Link>
  );
}

export function AdminPanel({
  data,
  analytics,
}: {
  data: AdminOverview;
  analytics: AnalyticsData;
}) {
  const disabled = data.models.filter(
    (model) => model.status === "disabled",
  ).length;
  const unpriced = data.pricing.unpricedCount;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Operations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Admin overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Provider state, catalog pricing, tenant credit, and the money the
            gateway actually recorded. Every number comes from the same rows
            that settle requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href="/admin/pricing"
            icon="fa-calculator"
            label="Price the catalog"
          />
          <LinkButton
            href="/admin/analytics"
            icon="fa-chart-line"
            label="Open analytics"
          />
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail={`${disabled} disabled · ${data.models.length} rows total`}
          icon="fa-layer-group"
          label="Catalog"
          value={formatNumber(data.stats.modelCount)}
        />
        <StatCard
          detail={`${data.stats.paidModelCount} priced · ${data.stats.subscriptionModelCount} subscription-only`}
          icon="fa-tag"
          label="Non-free"
          value={formatNumber(
            data.stats.paidModelCount + data.stats.subscriptionModelCount,
          )}
        />
        <StatCard
          detail={`${formatCompact(analytics.totals.requests)} requests in 30 days`}
          icon="fa-sack-dollar"
          label="30d revenue"
          value={formatMicros(analytics.totals.chargedMicros)}
        />
        <StatCard
          detail={`${formatMarginPercent(data.pricing.averageInputMarginBps)} average input margin`}
          icon="fa-wallet"
          label="Available credit"
          value={formatMicros(data.account.availableMicros)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]" id="provider">
        <ProviderCard provider={data.provider} />
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Sync and boundaries</Card.Title>
            <Card.Description>
              Sync reads the upstream balance, subscription, and catalog. It
              preserves operator disables, manual prices, and delisted rows.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4">
            <ProviderSyncButton />
            <div className="space-y-2 text-xs text-muted">
              <p>
                Provider key:{" "}
                <span className="text-foreground">
                  {data.provider.configured ? "configured" : "missing"}
                </span>
              </p>
              <p>
                Pricing:{" "}
                <span className="text-foreground">
                  {(data.pricing.markupBps / 100).toFixed(0)}% default markup
                </span>{" "}
                · {data.pricing.pricedCount} auto/manual rows priced
              </p>
              {unpriced > 0 ? (
                <p className="text-warning">
                  {unpriced} non-free{" "}
                  {unpriced === 1 ? "model has" : "models have"} no sell price
                  and will be rejected by the gateway.
                </p>
              ) : null}
              <p>
                Session: signed HttpOnly cookie, eight-hour expiry, SameSite
                Strict.
              </p>
            </div>
          </Card.Content>
        </Card>
      </section>

      <section id="credit">
        <CreditCard account={data.account} ledger={data.ledger} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card variant="secondary">
          <Card.Header>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Card.Title>Pricing snapshot</Card.Title>
                <Card.Description>
                  Cost is upstream. Sell price is what the gateway charges.
                </Card.Description>
              </div>
              <LinkButton
                href="/admin/pricing"
                icon="fa-arrow-right"
                label="Edit"
              />
            </div>
          </Card.Header>
          <Card.Content className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Priced models</p>
              <p className="mt-1 text-lg font-semibold">
                {data.pricing.pricedCount}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Avg input margin</p>
              <p className="mt-1 text-lg font-semibold">
                {formatMarginPercent(data.pricing.averageInputMarginBps)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Avg output margin</p>
              <p className="mt-1 text-lg font-semibold">
                {formatMarginPercent(data.pricing.averageOutputMarginBps)}
              </p>
            </div>
          </Card.Content>
        </Card>

        <Card variant="secondary">
          <Card.Header>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Card.Title>30-day money</Card.Title>
                <Card.Description>
                  Charged revenue minus upstream cost from recorded usage.
                </Card.Description>
              </div>
              <LinkButton
                href="/admin/analytics"
                icon="fa-arrow-right"
                label="Details"
              />
            </div>
          </Card.Header>
          <Card.Content className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Revenue</p>
              <p className="mt-1 text-lg font-semibold">
                {formatMicros(analytics.totals.chargedMicros)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Cost</p>
              <p className="mt-1 text-lg font-semibold">
                {formatMicros(analytics.totals.costMicros)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-muted">Gross margin</p>
              <p className="mt-1 text-lg font-semibold text-success">
                {formatMicros(analytics.totals.marginMicros)}
              </p>
            </div>
          </Card.Content>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" id="keys">
        <KeysCard keys={data.keys} />
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Key handling</Card.Title>
            <Card.Description>
              Admin mints and revokes the same consumer keys the gateway
              authenticates.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-3 text-sm text-muted">
            <p>
              Only the SHA-256 hash is stored. A created secret is shown once in
              the panel and is never retrievable again.
            </p>
            <p>
              Revoking is immediate: the next gateway request with that key
              returns 401.
            </p>
            <p>
              Keys belong to the single local tenant in this build. Customer
              signup and checkout are separate slices.
            </p>
          </Card.Content>
        </Card>
      </section>

      <section id="usage">
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Recent usage</Card.Title>
            <Card.Description>
              Revenue, upstream cost, latency, and status for the latest
              requests. Full detail lives in analytics.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-0 pb-0">
            {data.usage.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">
                No requests yet. Fund the tenant, create a key, and use the
                console tester.
              </p>
            ) : (
              <div className="scroll-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Model</th>
                      <th>Tokens</th>
                      <th className="text-right">Charged</th>
                      <th className="text-right">Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usage.slice(0, 12).map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap text-muted">
                          {new Date(row.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td>
                          <div className="font-medium">
                            {row.modelName ?? row.modelId ?? "—"}
                          </div>
                          <div className="mono mt-0.5 text-[11px] text-muted">
                            {row.keyPrefix ?? "—"}
                          </div>
                        </td>
                        <td className="text-muted">
                          {formatNumber(row.inputTokens)} /{" "}
                          {formatNumber(row.outputTokens)}
                        </td>
                        <td className="text-right">
                          {formatMicros(row.chargedMicros)}
                        </td>
                        <td className="text-right text-muted">
                          {formatMicros(row.costMicros)}
                        </td>
                        <td className="text-muted">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card.Content>
        </Card>
      </section>
    </>
  );
}
