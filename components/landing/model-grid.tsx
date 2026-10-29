import type { LandingData } from "@/lib/types";

import { ModelCatalogTable } from "@/components/catalog/model-catalog-table";

export function ModelGrid({ data }: { data: LandingData }) {
  return (
    <section
      className="landing-section mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
      id="models"
    >
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
        models={data.models}
        pageSize={Math.max(1, data.models.length)}
      />
      <p className="mt-4 font-mono text-[10px] leading-6 text-muted">
        All enabled models, with configured retail prices. Subscription models
        require an included plan; free-pool access is capacity-limited. Prices
        are USD per 1M tokens.
      </p>
    </section>
  );
}
