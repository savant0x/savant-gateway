import type { Overview } from "@/lib/types";

import Link from "next/link";

import { StatCard } from "./chips";
import { formatCompact, formatMicros, formatNumber } from "./format";
import { Hero } from "./hero";
import { KeysCard } from "./keys-card";
import { ProviderCard } from "./provider-card";
import { QuickStartCard } from "./quick-start-card";
import { TesterCard } from "./tester-card";
import { UsageCard } from "./usage-card";

import { ModelCatalogTable } from "@/components/catalog/model-catalog-table";

export function Dashboard({ initial }: { initial: Overview }) {
  return (
    <div className="space-y-6">
      <Hero provider={initial.provider} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail={`${initial.stats.paidModelCount} priced · ${initial.stats.subscriptionModelCount} subscription`}
          icon="fa-layer-group"
          label="Catalog"
          value={formatNumber(initial.stats.modelCount)}
        />
        <StatCard
          detail="available on the free pool"
          icon="fa-gift"
          label="Free models"
          value={formatNumber(initial.stats.freeModelCount)}
        />
        <StatCard
          detail={`${formatCompact(initial.stats.totalTokens)} tokens recorded`}
          icon="fa-wave-square"
          label="Requests"
          value={formatNumber(initial.stats.requestCount)}
        />
        <StatCard
          detail={`${formatMicros(initial.account.heldMicros)} held by live calls`}
          icon="fa-wallet"
          label="Available credit"
          value={formatMicros(initial.account.availableMicros)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <ProviderCard provider={initial.provider} />
        <QuickStartCard />
      </section>

      <section className="space-y-3" id="models">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">
              Catalog
            </h2>
            <p className="mt-1 text-sm text-muted">
              Sell prices are enforced by the gateway. Upstream cost is visible
              only in admin.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs font-medium transition-colors hover:border-accent/40 dark:border-white/10"
            href="/models"
          >
            Public catalog
            <i aria-hidden className="fa-solid fa-arrow-right text-accent" />
          </Link>
        </div>
        <ModelCatalogTable models={initial.models} pageSize={10} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2" id="keys">
        <KeysCard keys={initial.keys} />
        <TesterCard models={initial.models} />
      </section>

      <section id="usage">
        <UsageCard usage={initial.usage} />
      </section>
    </div>
  );
}
