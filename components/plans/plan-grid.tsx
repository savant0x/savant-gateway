"use client";

import type { PlanSummary } from "@/lib/types";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import Link from "next/link";
import { useState } from "react";

import {
  formatCompact,
  formatMicros,
  formatRatePercent,
  responseError,
} from "@/components/dashboard/format";
import { intervalLabel } from "@/lib/plan-lifecycle";

function overageCopy(plan: PlanSummary) {
  if (plan.overageMode === "block") return "Calls stop at the allowance";

  return `Extra usage bills at list price${plan.overageMarkupBps > 0 ? ` + ${formatRatePercent(plan.overageMarkupBps)}` : ""}`;
}

export function PlanGrid({
  plans,
  signedIn,
  activePlanSlug,
}: {
  plans: PlanSummary[];
  signedIn: boolean;
  activePlanSlug: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: PlanSummary) {
    setBusy(plan.slug);
    setError(null);

    try {
      const response = await fetch("/api/account/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan.slug }),
      });

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as { url?: string };
      const url = payload.url ? new URL(payload.url) : null;

      if (!url || url.protocol !== "https:") {
        throw new Error("Checkout returned an invalid URL.");
      }

      window.location.assign(url.toString());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not start subscription checkout.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const current = plan.slug === activePlanSlug;

          return (
            <Card
              key={plan.id}
              className="border border-white/10 bg-white/[0.03]"
            >
              <Card.Header>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Card.Title>{plan.name}</Card.Title>
                    <Card.Description>
                      {plan.description ?? "Subscription plan"}
                    </Card.Description>
                  </div>
                  {current ? <Chip color="success">Current</Chip> : null}
                </div>
              </Card.Header>
              <Card.Content className="space-y-4 text-sm">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">
                      {formatMicros(plan.priceMicros)}
                    </span>
                    <span className="text-xs text-muted">
                      / {plan.interval}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {intervalLabel(plan.interval)} billing in{" "}
                    {plan.currency.toUpperCase()}
                  </p>
                </div>

                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Included allowance</dt>
                    <dd>
                      {formatCompact(plan.includedWeightedTokens)} weighted
                      tokens
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Models</dt>
                    <dd>{plan.modelCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Groups</dt>
                    <dd className="text-right">
                      {plan.groups.map((group) => group.label).join(", ") ||
                        "Individual models"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">When exhausted</dt>
                    <dd className="text-right">{overageCopy(plan)}</dd>
                  </div>
                </dl>

                {current ? (
                  <Link
                    className="block rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-center text-xs text-success"
                    href="/account"
                  >
                    Manage this subscription
                  </Link>
                ) : signedIn ? (
                  <Button
                    className="w-full"
                    isDisabled={busy !== null}
                    variant="primary"
                    onPress={() => subscribe(plan)}
                  >
                    {busy === plan.slug ? <Spinner size="sm" /> : null}
                    Subscribe
                  </Button>
                ) : (
                  <Link
                    className="block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs transition-colors hover:bg-white/10"
                    href="/login"
                  >
                    Sign in to subscribe
                  </Link>
                )}
              </Card.Content>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
