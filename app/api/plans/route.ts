import type { PlanSummary } from "@/lib/types";

import { listActivePlans } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicPlan(plan: PlanSummary) {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMicros: plan.priceMicros,
    priceUsd: plan.priceMicros / 1_000_000,
    currency: plan.currency,
    interval: plan.interval,
    includedWeightedTokens: plan.includedWeightedTokens,
    overageMode: plan.overageMode,
    overageMarkupBps: plan.overageMarkupBps,
    groups: plan.groups,
    modelCount: plan.modelCount,
  };
}

export async function GET() {
  return Response.json(
    { plans: listActivePlans().map(publicPlan) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
