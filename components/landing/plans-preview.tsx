import type { PlanSummary } from "@/lib/types";

import Link from "next/link";

import { formatCompact, formatMicros } from "@/components/dashboard/format";

export function PlansPreview({ plans }: { plans: PlanSummary[] }) {
  if (plans.length === 0) return null;

  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Plans
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              Included models, metered allowance.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Each plan covers a snapshot of its included models. Included usage
              never touches prepaid credit; overage follows the policy shown.
            </p>
          </div>
          <Link
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition-colors hover:bg-white/10"
            href="/plans"
          >
            Compare plans
          </Link>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight">
                  {formatMicros(plan.priceMicros)}
                </span>
                <span className="text-xs text-muted">/ {plan.interval}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold">{plan.name}</h3>
              <p className="mt-1 text-xs leading-5 text-muted">
                {formatCompact(plan.includedWeightedTokens)} weighted tokens ·{" "}
                {plan.modelCount} models ·{" "}
                {plan.overageMode === "block"
                  ? "stops at the limit"
                  : "credit overage"}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
