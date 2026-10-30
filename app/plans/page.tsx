import type { Metadata } from "next";

import Link from "next/link";

import { primaryCta, secondaryCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { PlanGrid } from "@/components/plans/plan-grid";
import { getCustomerSession } from "@/lib/customer-auth";
import { customerSubscriptionSummary, listSellablePlans } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plans",
  description:
    "Subscription plans with included model groups, weighted-token allowances, and explicit overage policy.",
};

export default async function PlansPage() {
  const plans = listSellablePlans();
  const customer = await getCustomerSession();
  const subscription = customer
    ? customerSubscriptionSummary(customer.id)
    : null;
  const activePlanSlug =
    subscription &&
    (subscription.status === "active" || subscription.status === "past_due")
      ? subscription.planSlug
      : null;

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Customer plans
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              A plan for the work ahead.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              A plan covers the exact model snapshot taken when it activates.
              Included usage does not touch credit. When the allowance runs out,
              the plan either stops calls or bills overage from prepaid credit
              at the model&apos;s list price plus the plan markup you see below.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className={primaryCta} href="/account">
                Open your account
              </Link>
              <Link className={secondaryCta} href="/models">
                Browse models
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-sm text-muted">
              <p className="font-medium text-foreground">
                Plans are not available yet.
              </p>
              <p className="mt-2 leading-6">
                Check the model catalog for available usage-based options.
              </p>
            </div>
          ) : (
            <PlanGrid
              activePlanSlug={activePlanSlug}
              plans={plans}
              signedIn={Boolean(customer)}
            />
          )}

          {plans.length > 0 ? (
            <p className="mt-8 max-w-3xl text-xs leading-6 text-muted">
              Payment is completed on Stripe&apos;s hosted page. Access starts
              only after Stripe&apos;s signed invoice webhook confirms payment.
              Cancel from your account at any time; access remains until the
              paid period ends.
            </p>
          ) : null}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
