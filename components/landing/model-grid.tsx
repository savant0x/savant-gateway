import type { LandingData } from "@/lib/types";
import type { PriceComparison } from "@/lib/price-comparison";

import { ModelCatalogTable } from "@/components/catalog/model-catalog-table";
import { catalogTableData } from "@/lib/catalog-payload";

export function ModelGrid({
  data,
  comparisons = {},
  benchmarkFetchedAt = null,
}: {
  data: LandingData;
  comparisons?: Record<string, PriceComparison>;
  benchmarkFetchedAt?: string | null;
}) {
  const table = catalogTableData(data.models, {}, comparisons);

  return (
    <section className="border-t border-border" id="models">
      <div className="landing-section mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-section-head">
          <div>
            <p className="section-kicker">01 / Models &amp; pricing</p>
            <h2 className="mt-4">
              Find your model.
              <br />
              <span className="text-accent">Know your cost.</span>
            </h2>
          </div>
          <p>
            Different tasks call for different models. Compare input and output
            rates before your first request.
          </p>
        </div>
        <ModelCatalogTable
          benchmarkFetchedAt={benchmarkFetchedAt}
          comparisons={table.comparisons}
          models={table.models}
          pageSize={Math.max(1, table.models.length)}
        />
        <p className="mt-4 font-mono text-[10px] leading-6 text-muted">
          All enabled models, with configured retail prices. Subscription models
          require an included plan; free-pool access is capacity-limited. Prices
          are USD per 1M tokens.
        </p>
      </div>
    </section>
  );
}
