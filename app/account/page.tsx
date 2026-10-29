import type { Metadata } from "next";

import { Card } from "@heroui/react";
import { headers } from "next/headers";

import { AccountHeader } from "@/components/account/account-header";
import { BillingHistory } from "@/components/account/billing-history";
import { CustomerKeysCard } from "@/components/account/keys-card";
import { SubscriptionCard } from "@/components/account/subscription-card";
import { TopupCard } from "@/components/account/topup-card";
import { TrialCard } from "@/components/account/trial-card";
import { StatCard } from "@/components/dashboard/chips";
import {
  formatCompact,
  formatMicros,
  formatNumber,
} from "@/components/dashboard/format";
import { UsageCard } from "@/components/dashboard/usage-card";
import { siteConfig } from "@/config/site";
import { requireCustomerPage } from "@/lib/customer-auth";
import { readStripeConfig } from "@/lib/stripe";
import { customerSubscriptionSummary, getCustomerAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

function baseUrlFromHeaders(host: string | null, proto: string | null) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) return configured.replace(/\/$/, "");
  if (host) return `${proto === "https" ? "https" : "http"}://${host}`;

  return siteConfig.url;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; subscription?: string }>;
}) {
  const customer = await requireCustomerPage();
  const data = getCustomerAccount(customer);
  const subscription = customerSubscriptionSummary(customer.id);
  const stripe = readStripeConfig();
  const requestHeaders = await headers();
  const params = await searchParams;
  const baseUrl = baseUrlFromHeaders(
    requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
  );

  return (
    <div className="workspace relative flex min-h-screen flex-col bg-background">
      <AccountHeader customer={customer} />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
              Customer account
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
              {customer.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Balance, keys, and usage for {customer.email}.
            </p>
          </div>
          <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
            {customer.status} · joined{" "}
            {new Date(customer.createdAt).toISOString().slice(0, 10)}
          </div>
        </div>

        {params.topup === "success" ? (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
            Stripe returned successfully. Credit is applied by the signed
            webhook — refresh in a moment if the balance has not moved yet.
          </p>
        ) : null}
        {params.topup === "cancelled" ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            Checkout was cancelled. Nothing was charged and no credit was added.
          </p>
        ) : null}
        {params.subscription === "success" ? (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
            Stripe returned successfully. Included access starts only after the
            signed invoice webhook confirms payment — refresh in a moment if the
            plan does not show as active yet.
          </p>
        ) : null}
        {params.subscription === "cancelled" ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            Subscription checkout was cancelled. Nothing was charged and no plan
            was activated.
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            detail={`${formatMicros(data.account.heldMicros)} held by live calls`}
            icon="fa-wallet"
            label="Available credit"
            value={formatMicros(data.account.availableMicros)}
          />
          <StatCard
            detail="successful Stripe top-ups"
            icon="fa-sack-dollar"
            label="Purchased"
            value={formatMicros(data.totalPurchasedMicros)}
          />
          <StatCard
            detail={`${data.keys.filter((key) => key.status === "active").length} active`}
            icon="fa-key"
            label="API keys"
            value={formatNumber(data.keys.length)}
          />
          <StatCard
            detail={`${formatCompact(data.totalTokens)} tokens recorded`}
            icon="fa-wave-square"
            label="Requests"
            value={formatNumber(data.totalRequests)}
          />
        </section>

        <TrialCard userId={customer.id} />

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <TopupCard configured={stripe.configured} reason={stripe.reason} />
          <CustomerKeysCard keys={data.keys} />
        </section>

        <SubscriptionCard
          stripeConfigured={stripe.configured}
          subscription={subscription}
        />

        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Quick start</Card.Title>
            <Card.Description>
              Your key works on the OpenAI-compatible endpoint.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-3 text-sm">
            <pre className="scroll-shell rounded-xl bg-black/30 p-3 text-xs leading-5 text-muted">
              <code>{`curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-…" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"<model-id>","messages":[{"role":"user","content":"Hello"}]}'`}</code>
            </pre>
            <p className="text-xs text-muted">
              Browse model ids and sell prices in the{" "}
              <a className="text-accent hover:underline" href="/models">
                public catalog
              </a>{" "}
              or read the{" "}
              <a className="text-accent hover:underline" href="/docs">
                API reference
              </a>
              . Access follows your trial allowance, available credit and plan
              entitlements. Plan-only rows need a subscription that includes
              them. Paid usage stops when available credit cannot cover a
              request.
            </p>
          </Card.Content>
        </Card>

        <UsageCard
          description="Requests made with this account's keys, newest first. The charge is the settled debit from your credit balance."
          empty="No requests yet. Create a key and send a chat completion."
          usage={data.usage}
        />

        <BillingHistory ledger={data.ledger} topups={data.topups} />
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>{siteConfig.name}</span>
          <span>Customer account · payments confirmed by Stripe webhook</span>
        </div>
      </footer>
    </div>
  );
}
