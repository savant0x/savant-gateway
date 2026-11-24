import type { Metadata } from "next";

import { ProviderCapitalPanel } from "@/components/admin/provider-capital";
import { AdminProvidersPanel } from "@/components/admin/providers-panel";
import {
  getProviderCapital,
  listProviderCatalogSummary,
  listProviders,
} from "@/lib/store";
import { refreshEnabledProviderAccounts } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin providers",
  robots: { index: false, follow: false },
};

export default async function AdminProvidersPage() {
  await refreshEnabledProviderAccounts();

  const [providers, capital, summaries] = await Promise.all([
    listProviders(),
    getProviderCapital(),
    listProviderCatalogSummary(),
  ]);
  // The decision backlog is an admission fact: a review-required provider serves
  // nothing for a row until a chat decision is recorded, so it belongs beside
  // the model count rather than only inside the review modal (FID-2026-1124-001).
  const backlog = new Map(
    summaries.map((row) => [row.slug, row.needsChatDecisionCount]),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Providers
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Upstreams and protocols
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Register one account per upstream. The gateway routes each model by
            its own protocol, so an OpenAI-compatible provider and an Anthropic
            provider can serve the same catalog without splitting the gateway.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {providers.length} providers ·{" "}
          {providers.filter((provider) => provider.enabled).length} enabled
        </div>
      </div>

      <AdminProvidersPanel backlog={backlog} providers={providers} />

      <ProviderCapitalPanel data={capital} />
    </>
  );
}
