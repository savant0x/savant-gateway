import { LandingPage } from "@/components/landing/landing-page";
import { getOpenRouterModels } from "@/lib/openrouter-prices";
import { buildCatalogComparison } from "@/lib/price-comparison";
import { getLandingData, listSellablePlans } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, plans] = await Promise.all([
    getLandingData(),
    listSellablePlans(),
  ]);
  // The benchmark is cached for six hours and fails open, so the landing page
  // keeps rendering its own prices when the public list is unreachable.
  const benchmark = await getOpenRouterModels();
  const comparison = buildCatalogComparison(data.models, benchmark.models);

  return (
    <LandingPage
      benchmarkFetchedAt={
        benchmark.models.length > 0
          ? new Date(benchmark.fetchedAt).toISOString()
          : null
      }
      comparisons={comparison.comparisons}
      data={data}
      plans={plans}
    />
  );
}
