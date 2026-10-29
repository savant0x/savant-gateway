import type { LandingData } from "@/lib/types";

import { Features } from "./features";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { ModelGrid } from "./model-grid";
import { QuickStart } from "./quickstart";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { StatsStrip } from "./stats";

export function LandingPage({ data }: { data: LandingData }) {
  return (
    <div className="min-h-screen bg-[#050b12] text-slate-100">
      <SiteHeader />
      <main>
        <Hero data={data} />
        <StatsStrip data={data} />
        <ModelGrid data={data} />
        <HowItWorks />
        <Features />
        <QuickStart />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
