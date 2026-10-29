import type { Metadata } from "next";

import {
  AdminTopupsTable,
  CustomersTable,
} from "@/components/admin/customers-table";
import { formatMicros, formatNumber } from "@/components/dashboard/format";
import { siteConfig } from "@/config/site";
import { readStripeConfig } from "@/lib/stripe";
import { listCustomerSummaries, listTopups } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin customers",
  robots: { index: false, follow: false },
};

export default function AdminCustomersPage() {
  const customers = listCustomerSummaries();
  const topups = listTopups(50);
  const stripe = readStripeConfig();
  const totalCredit = customers.reduce(
    (sum, customer) => sum + customer.creditMicros,
    0,
  );
  const paidTopups = topups.filter((topup) => topup.status === "paid");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Customers
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Who holds credit
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Signup accounts, their prepaid balances, key count, request volume,
            and the Stripe checkouts that funded them. The local development
            tenant is not listed here.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {formatNumber(customers.length)} customers ·{" "}
          {formatMicros(totalCredit)} credit outstanding ·{" "}
          {formatNumber(paidTopups.length)} paid top-ups shown
        </div>
      </div>

      <p
        className={`rounded-xl border px-4 py-3 text-xs ${
          stripe.configured
            ? "border-success/30 bg-success/10 text-success"
            : "border-warning/30 bg-warning/10 text-warning"
        }`}
      >
        {stripe.configured
          ? `Stripe is configured. Webhook endpoint: ${siteConfig.url}/api/webhooks/stripe`
          : stripe.reason}
      </p>

      <CustomersTable customers={customers} />
      <AdminTopupsTable topups={topups} />
    </>
  );
}
