import type { Metadata } from "next";

import Link from "next/link";

import { CustomerContributionTable } from "@/components/admin/customer-contribution";
import { FreeCohortPanel } from "@/components/admin/free-cohort-panel";
import { PlanSimulator } from "@/components/admin/plan-simulator";
import {
  normalizeCohortWindow,
  normalizeCustomerPage,
  normalizeEconomicsRange,
  normalizeObservationWindow,
} from "@/lib/economics";
import {
  getCustomerContributionPage,
  getFreeCohort,
  listSimulationModels,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin economics",
  robots: { index: false, follow: false },
};

export default async function AdminEconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    page?: string | string[];
    cohort?: string | string[];
    observation?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const range = normalizeEconomicsRange(first(params.range));
  const page = normalizeCustomerPage(first(params.page));
  const cohortWindow = normalizeCohortWindow(first(params.cohort));
  const observationWindow = normalizeObservationWindow(
    first(params.observation),
  );

  const [contribution, cohort, models] = await Promise.all([
    getCustomerContributionPage(range, page),
    getFreeCohort(cohortWindow, observationWindow),
    listSimulationModels(),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Economics
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Customer and offering economics
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            One projection for customer contribution, free-tier cohorts and a
            read-only plan what-if. It keeps prepaid top-ups, settled credit,
            plan cash and recorded upstream cost on separate clocks. Nothing on
            this page can publish a plan, change a subscription or move money.
          </p>
        </div>

        <Link
          className="rounded-lg border border-black/10 px-3 py-2 text-xs text-muted hover:text-foreground dark:border-white/10"
          href="/admin/analytics"
        >
          Open revenue analytics
        </Link>
      </div>

      <CustomerContributionTable data={contribution} />

      <FreeCohortPanel
        cohort={cohort}
        cohortWindow={cohortWindow}
        observationWindow={observationWindow}
        range={range}
      />

      <PlanSimulator models={models} />

      <section className="grid gap-3 text-xs text-muted sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Revenue</p>
          <p className="mt-1 leading-5">
            Credit revenue is a settled debit. Plan cash is a paid invoice. A
            top-up is principal and a liability until usage settles, so it never
            appears as revenue here.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Cost and coverage</p>
          <p className="mt-1 leading-5">
            Recorded cost is the synced or manual upstream estimate stored on
            the usage row. Fees and refunds have no source in this view and are
            shown as unavailable, not as zero.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Cohorts</p>
          <p className="mt-1 leading-5">
            A cohort is a bounded signup window plus a fixed observation window.
            The rate is observed sequence, not proof that a free call caused a
            purchase.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Simulation</p>
          <p className="mt-1 leading-5">
            The simulator shares catalog cost, margin and token-weight math with
            the live pricing surfaces. Its output remains simulated and cannot
            be used as observed revenue.
          </p>
        </div>
      </section>
    </>
  );
}
