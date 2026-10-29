import type { Overview } from "@/lib/types";

import { StatCard } from "./chips";
import { formatCompact, formatNumber } from "./format";
import { Hero } from "./hero";
import { KeysCard } from "./keys-card";
import { ModelsCard } from "./models-card";
import { ProviderCard } from "./provider-card";
import { QuickStartCard } from "./quick-start-card";
import { TesterCard } from "./tester-card";
import { UsageCard } from "./usage-card";

export function Dashboard({ initial }: { initial: Overview }) {
  const freeModels = initial.models.filter((model) => model.access === "free");

  return (
    <div className="space-y-6">
      <Hero provider={initial.provider} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail="from the provider catalog"
          label="Models"
          value={formatNumber(initial.stats.modelCount)}
        />
        <StatCard
          detail="available on the free pool"
          label="Free models"
          value={formatNumber(initial.stats.freeModelCount)}
        />
        <StatCard
          detail="active consumer keys"
          label="Keys"
          value={formatNumber(initial.stats.keyCount)}
        />
        <StatCard
          detail={`${formatCompact(initial.stats.totalTokens)} tokens recorded`}
          label="Requests"
          value={formatNumber(initial.stats.requestCount)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <ProviderCard provider={initial.provider} />
        <QuickStartCard />
      </section>

      <section id="models">
        <ModelsCard models={initial.models} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2" id="keys">
        <KeysCard keys={initial.keys} />
        <TesterCard freeModels={freeModels} />
      </section>

      <section id="usage">
        <UsageCard usage={initial.usage} />
      </section>
    </div>
  );
}
