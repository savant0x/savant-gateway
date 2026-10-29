import type { LandingData, PlanSummary } from "@/lib/types";

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
}: {
  data: LandingData;
  plans: PlanSummary[];
}) {
  return (
    <div className="min-h-screen bg-[#050b12] text-slate-100">
      <SiteHeader />
      <main>
        <Hero data={data} />
        <StatsStrip data={data} />
        <ModelGrid data={data} />
        <PlansPreview plans={plans} />
        <HowItWorks />
        <Features />
        <QuickStart />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
