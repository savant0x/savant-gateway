import type { LandingData, PlanSummary } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { Features } from "./features";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { ModelGrid } from "./model-grid";
import { PlansPreview } from "./plans-preview";
import { QuickStart } from "./quickstart";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { StatsStrip } from "./stats";

export function LandingPage({
  data,
  plans,
  comparisons = {},
  benchmarkFetchedAt = null,
}: {
  data: LandingData;
  plans: PlanSummary[];
  comparisons?: Record<string, PriceComparison>;
  benchmarkFetchedAt?: string | null;
}) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="landing-bands">
        <Hero data={data} />
        <StatsStrip data={data} />
        <ModelGrid
          benchmarkFetchedAt={benchmarkFetchedAt}
          comparisons={comparisons}
          data={data}
        />
        <Features />
        <QuickStart />
        <HowItWorks />
        <PlansPreview plans={plans} />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
