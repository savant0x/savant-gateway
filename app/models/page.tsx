import type { Metadata } from "next";

import Link from "next/link";

import { ModelCatalogTable } from "@/components/catalog/model-catalog-table";
import { formatNumber } from "@/components/dashboard/format";
import { primaryCta, secondaryCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { siteConfig } from "@/config/site";
import { getCatalogData } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model catalog",
  description:
    "Every model on Savant Gateway with its family, price group, and per-million-token price.",
};

export default function ModelsPage() {
  const data = getCatalogData();

  return (
    <div className="min-h-screen bg-[#050b12] text-slate-100">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Savant Gateway · provider catalog
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              One endpoint. Every model Savant Gateway carries.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Savant Gateway is the provider; free, paid, and subscription are
              price groups. Free-pool models are included. Paid models debit the
              tenant&apos;s credit balance at the listed sell price. Plan-only
              models need an active subscription that includes them. The
              upstream key stays on the server, and upstream cost is never part
              of the public catalog.
            </p>

            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-server mr-2 text-cyan-300"
                />
                Provider: {siteConfig.provider.name}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-layer-group mr-2 text-cyan-300"
                />
                {formatNumber(data.stats.modelCount)} models
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-gift mr-2 text-emerald-300"
                />
                {formatNumber(data.stats.freeModelCount)} free
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i aria-hidden className="fa-solid fa-tag mr-2 text-cyan-300" />
                {formatNumber(data.stats.paidModelCount)} priced
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-key mr-2 text-amber-300"
                />
                {data.stats.subscriptionModelCount} subscription-only
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link className={primaryCta} href="/dashboard">
                Open the console
              </Link>
              <Link className={secondaryCta} href="/#quickstart">
                See the request
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <ModelCatalogTable models={data.models} pageSize={20} />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
