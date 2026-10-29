import type { LandingData } from "@/lib/types";

import { formatNumber } from "@/components/dashboard/format";

const STATS = [
  { label: "Active models", icon: "fa-layer-group" },
  { label: "Free-pool models", icon: "fa-gift" },
  { label: "Paid & plan models", icon: "fa-tag" },
  { label: "Model families", icon: "fa-code-branch" },
] as const;

export function StatsStrip({ data }: { data: LandingData }) {
  const values = [
    data.stats.modelCount,
    data.stats.freeModelCount,
    data.stats.paidModelCount + data.stats.subscriptionModelCount,
    new Set(data.models.map((model) => model.family)).size,
  ];

  return (
    <section aria-label="Catalog at a glance" className="landing-stats">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-stats-grid">
          {STATS.map((stat, index) => (
            <div key={stat.label} className="landing-stat">
              <p className="landing-stat-index">
                <span aria-hidden className="landing-stat-slash">
                  {"//"}
                </span>
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="landing-stat-value">
                {formatNumber(values[index])}
              </p>
              <p className="landing-stat-label">
                <i aria-hidden className={`fa-solid ${stat.icon}`} />
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
