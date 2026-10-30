import type { Metadata } from "next";

import { Card } from "@heroui/react";

import { GatewaySettings } from "@/components/admin/gateway-settings";
import { StatCard } from "@/components/dashboard/chips";
import { formatNumber } from "@/components/dashboard/format";
import { CONTEXT_BANNER_MAX_CHARS } from "@/lib/context-banner";
import { getAllocationSummary } from "@/lib/store/allocations";
import { getBannerConfig } from "@/lib/store/banner";
import { utcDay } from "@/lib/store/free-pool";
import { refreshProviderRuntime } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin gateway",
  robots: { index: false, follow: false },
};

export default async function AdminGatewayPage() {
  await refreshProviderRuntime("savant");

  const summary = getAllocationSummary(utcDay());
  const banner = getBannerConfig();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Gateway
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Daily trial credits and context
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The upstream free plan resets once per UTC day. Here you set how
            much of that pool the gateway distributes and what every upstream
            request carries.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          UTC day {summary.day}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail={`${summary.allocationBps / 100}% of the daily pool`}
          icon="fa-arrows-split-up-and-left"
          label="Allocatable"
          value={
            summary.capacityAvailable
              ? formatNumber(summary.allocatableTokens)
              : "Unavailable"
          }
        />
        <StatCard
          detail={`reserved ${formatNumber(summary.reservedTokens)}`}
          icon="fa-user-group"
          label="Allocated"
          value={formatNumber(summary.allocatedTokens)}
        />
        <StatCard
          detail={`${summary.activeAccounts} activated ${summary.activeAccounts === 1 ? "account" : "accounts"}`}
          icon="fa-equals"
          label="Per account"
          value={
            summary.capacityAvailable
              ? formatNumber(summary.perAccountTokens)
              : "Unavailable"
          }
        />
        <StatCard
          detail="settled weighted tokens today"
          icon="fa-gauge-high"
          label="Used today"
          value={formatNumber(summary.usedTokens)}
        />
      </section>

      <GatewaySettings
        banner={banner}
        bannerMaxChars={CONTEXT_BANNER_MAX_CHARS}
        summary={summary}
      />

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Activated accounts today</Card.Title>
          <Card.Description>
            Allocation rows appear when an account checks its daily trial
            credits or first calls a trial model. Usage and in-flight holds are
            tracked separately from the allocation.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-0 pb-0">
          {summary.rows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">
              No activated accounts yet. An account counts once it holds an
              active API key.
            </p>
          ) : (
            <div className="scroll-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="text-right">Allocated</th>
                    <th className="text-right">Used</th>
                    <th className="text-right">In flight</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-[11px] text-muted">
                          {row.email}
                        </div>
                      </td>
                      <td className="text-right">
                        {formatNumber(row.allocatedTokens)}
                      </td>
                      <td className="text-right text-muted">
                        {formatNumber(row.usedTokens)}
                      </td>
                      <td className="text-right text-muted">
                        {formatNumber(row.heldTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </>
  );
}
