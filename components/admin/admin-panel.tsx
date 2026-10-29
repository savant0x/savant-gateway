import type { AdminOverview } from "@/lib/types";

import { Card } from "@heroui/react";

import { AdminHeader } from "./admin-header";
import { AdminModelsTable } from "./models-table";

import { KeysCard } from "@/components/dashboard/keys-card";
import { ProviderCard } from "@/components/dashboard/provider-card";
import { StatCard } from "@/components/dashboard/chips";
import { UsageCard } from "@/components/dashboard/usage-card";
import { formatCompact, formatNumber } from "@/components/dashboard/format";
import { ProviderSyncButton } from "@/components/provider-sync";
import { siteConfig } from "@/config/site";

export function AdminPanel({ data }: { data: AdminOverview }) {
  const disabled = data.allModels.filter(
    (model) => model.status === "disabled",
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader />

      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
              Operations
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
              Admin panel
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Signed-in control of the provider connection, the catalog, and
              consumer access. The local console remains separate.
            </p>
          </div>
          <span className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
            {disabled} disabled · {data.allModels.length} catalogued
          </span>
        </div>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            detail="active in the catalog"
            label="Models"
            value={formatNumber(data.stats.modelCount)}
          />
          <StatCard
            detail="routable on the free pool"
            label="Free models"
            value={formatNumber(data.stats.freeModelCount)}
          />
          <StatCard
            detail="active consumer keys"
            label="Keys"
            value={formatNumber(data.stats.keyCount)}
          />
          <StatCard
            detail={`${formatCompact(data.stats.totalTokens)} tokens metered`}
            label="Requests"
            value={formatNumber(data.stats.requestCount)}
          />
        </section>

        <section
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
          id="provider"
        >
          <ProviderCard provider={data.provider} />
          <Card variant="secondary">
            <Card.Header>
              <Card.Title>Sync and boundaries</Card.Title>
              <Card.Description>
                Sync reads the upstream balance, subscription, and catalog. It
                preserves models you disabled here.
              </Card.Description>
            </Card.Header>
            <Card.Content className="space-y-4">
              <ProviderSyncButton />
              <div className="space-y-2 text-xs text-muted">
                <p>
                  Provider key:{" "}
                  <span className="text-foreground">
                    {data.provider.configured ? "configured" : "missing"}
                  </span>
                </p>
                <p>
                  Session: signed HttpOnly cookie, eight-hour expiry, SameSite
                  Strict.
                </p>
                <p>
                  Remote access still requires replacing the loopback guard on
                  the console APIs.
                </p>
              </div>
            </Card.Content>
          </Card>
        </section>

        <section id="models">
          <AdminModelsTable models={data.allModels} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2" id="keys">
          <KeysCard keys={data.keys} />
          <Card variant="secondary">
            <Card.Header>
              <Card.Title>Key handling</Card.Title>
              <Card.Description>
                Admin mints and revokes the same consumer keys the gateway
                authenticates.
              </Card.Description>
            </Card.Header>
            <Card.Content className="space-y-3 text-sm text-muted">
              <p>
                Only the SHA-256 hash is stored. A created secret is shown once
                in the panel and is never retrievable again.
              </p>
              <p>
                Revoking is immediate: the next gateway request with that key
                returns 401.
              </p>
              <p>
                Keys belong to the single local developer tenant in this build;
                there is no customer account system yet.
              </p>
            </Card.Content>
          </Card>
        </section>

        <section id="usage">
          <UsageCard usage={data.usage} />
        </section>
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>{siteConfig.name}</span>
          <span>Admin · session required · no-store</span>
        </div>
      </footer>
    </div>
  );
}
