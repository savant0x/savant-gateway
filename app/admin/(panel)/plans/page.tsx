import type { Metadata } from "next";

import { PlansPanel } from "@/components/admin/plans-panel";
import { formatNumber } from "@/components/dashboard/format";
import { listAllModels, listModelGroups, listPlans } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin plans",
  robots: { index: false, follow: false },
};

export default function AdminPlansPage() {
  const plans = listPlans();
  const groups = listModelGroups();
  const models = listAllModels();
  const active = plans.filter((plan) => plan.status === "active").length;
  const subscribers = plans.reduce(
    (total, plan) => total + plan.activeSubscriberCount,
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Plans
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Subscription products
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Author the plan catalog, choose included groups and models, and set
            the allowance and overage policy. Existing subscribers keep their
            purchase snapshot until an explicit entitlement refresh.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {formatNumber(plans.length)} plans · {active} active ·{" "}
          {formatNumber(subscribers)} active subscribers
        </div>
      </div>

      <PlansPanel groups={groups} models={models} plans={plans} />
    </>
  );
}
