import type { LandingData } from "@/lib/types";

import { formatCompact, formatNumber } from "@/components/dashboard/format";

export function StatsStrip({ data }: { data: LandingData }) {
  const items = [
    {
      label: "Active models",
      value: formatNumber(data.stats.modelCount),
    },
    {
      label: "Free models",
      value: formatNumber(data.stats.freeModelCount),
    },
    {
      label: "Requests recorded",
      value: formatNumber(data.stats.requestCount),
    },
    {
      label: "Tokens metered",
      value: formatCompact(data.stats.totalTokens),
    },
  ];

  return (
    <section className="border-b border-white/10 bg-white/[0.02]">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 divide-white/10 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x lg:px-8">
        {items.map((item) => (
          <div key={item.label} className="px-2 py-7 lg:px-8">
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {item.value}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
