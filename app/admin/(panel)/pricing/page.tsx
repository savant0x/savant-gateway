import type { Metadata } from "next";

import { Card } from "@heroui/react";

import { MarkupForm } from "@/components/admin/markup-form";
import { PricingTable } from "@/components/admin/pricing-table";
import { StatCard } from "@/components/dashboard/chips";
import {
  formatMarginPercent,
  formatNumber,
} from "@/components/dashboard/format";
import { getPricingData, listModelGroups } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin pricing",
  robots: { index: false, follow: false },
};

export default function AdminPricingPage() {
  const data = getPricingData();
  const groups = listModelGroups();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Pricing
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Sell price, cost, margin
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Prices are USD per 1M tokens. Cost comes from the synced provider
            catalog; sell price is what this gateway charges. Free-group rows
            are always zero — move the model to a paid group to charge for a
            zero-cost model.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {data.summary.pricedCount} priced · {data.summary.unpricedCount}{" "}
          unpriced · {data.summary.freeCount} free
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail="applied to auto-priced rows"
          icon="fa-percent"
          label="Default markup"
          value={`${(data.summary.markupBps / 100).toFixed(0)}%`}
        />
        <StatCard
          detail="non-free rows with a sell price"
          icon="fa-tag"
          label="Priced models"
          value={formatNumber(data.summary.pricedCount)}
        />
        <StatCard
          detail="non-free rows the gateway will reject"
          icon="fa-triangle-exclamation"
          label="Unpriced models"
          value={formatNumber(data.summary.unpricedCount)}
        />
        <StatCard
          detail={`${formatMarginPercent(data.summary.averageOutputMarginBps)} average output margin`}
          icon="fa-chart-pie"
          label="Avg input margin"
          value={formatMarginPercent(data.summary.averageInputMarginBps)}
        />
      </section>

      <MarkupForm markupBps={data.summary.markupBps} />

      <PricingTable groups={groups} models={data.models} />

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>How the math works</Card.Title>
          <Card.Description>
            The same integers that show here are the ones the gateway charges.
          </Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-4 text-sm text-muted sm:grid-cols-2">
          <div className="rounded-xl bg-surface p-4">
            <p className="mono text-xs text-foreground">
              margin = (sell − cost) ÷ sell
            </p>
            <p className="mt-2 text-xs leading-5">
              Shown per direction. A negative margin means the sell price is
              below upstream cost.
            </p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="mono text-xs text-foreground">
              profit = (sell_in + sell_out) − (cost_in + cost_out)
            </p>
            <p className="mt-2 text-xs leading-5">
              Blended profit for 1M input tokens plus 1M output tokens at the
              current prices.
            </p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="text-xs font-medium text-foreground">Auto pricing</p>
            <p className="mt-2 text-xs leading-5">
              New syncs price new rows at cost × (1 + default markup). Existing
              auto rows reprice when the upstream cost changes. The markup
              action can reprice every catalog row.
            </p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="text-xs font-medium text-foreground">
              Manual pricing
            </p>
            <p className="mt-2 text-xs leading-5">
              Editing one row marks it manual. A provider sync preserves it,
              including a deliberate zero, until the operator reapplies the
              markup with overwrite enabled.
            </p>
          </div>
        </Card.Content>
      </Card>
    </>
  );
}
