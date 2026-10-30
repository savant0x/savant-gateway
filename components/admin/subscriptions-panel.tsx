"use client";

import type {
  CustomerSummary,
  PlanSummary,
  SubscriptionSummary,
} from "@/lib/types";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  formatCompact,
  formatMicros,
  formatRatePercent,
  responseError,
} from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";

function statusColor(status: SubscriptionSummary["status"]) {
  if (status === "active") return "success" as const;
  if (status === "past_due") return "warning" as const;
  if (status === "incomplete") return "default" as const;

  return "danger" as const;
}

export function SubscriptionsPanel({
  subscriptions,
  plans,
  customers,
}: {
  subscriptions: SubscriptionSummary[];
  plans: PlanSummary[];
  customers: CustomerSummary[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(customers[0]?.id ?? "");
  const [planId, setPlanId] = useState(
    plans.find((plan) => plan.status === "active")?.id ?? plans[0]?.id ?? "",
  );
  const [grantEnd, setGrantEnd] = useState("");
  const [extendDates, setExtendDates] = useState<Record<string, string>>({});
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(input: {
    key: string;
    body: Record<string, unknown>;
    message: string;
  }) {
    setBusy(input.key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body),
      });

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) throw new Error(await responseError(response));

      setNotice(input.message);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update the subscription.",
      );
    } finally {
      setBusy(null);
    }
  }

  const grantablePlans = plans.filter((plan) => plan.status !== "draft");

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {notice}
        </p>
      ) : null}

      <Card>
        <Card.Header>
          <Card.Title>Grant a manual subscription</Card.Title>
          <Card.Description>
            Comp access without a Stripe payment. Manual grants last one period,
            do not auto-renew, and can be extended or revoked here.
          </Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-muted">
            <span className="block">Customer</span>
            <select
              className="h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none dark:border-white/10"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.email}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span className="block">Plan</span>
            <select
              className="h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none dark:border-white/10"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
            >
              {grantablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.status})
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Period end (optional)</span>
            <Input
              aria-label="Manual grant period end"
              type="date"
              value={grantEnd}
              onChange={(event) => setGrantEnd(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              isDisabled={!userId || !planId || busy !== null}
              variant="primary"
              onPress={() =>
                act({
                  key: "grant",
                  body: {
                    action: "grant",
                    userId,
                    planId,
                    periodEnd: grantEnd
                      ? new Date(`${grantEnd}T23:59:59.000Z`).toISOString()
                      : null,
                  },
                  message: "Manual subscription granted.",
                })
              }
            >
              {busy === "grant" ? <Spinner size="sm" /> : null}
              Grant plan
            </Button>
          </div>
          {grantablePlans.length === 0 ? (
            <p className="text-xs text-warning sm:col-span-2 lg:col-span-4">
              Create an active or archived plan before granting subscriptions.
            </p>
          ) : null}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Subscriptions</Card.Title>
          <Card.Description>
            Snapshot price, entitlement count, period usage, and the latest
            invoice. Sync reconciles Stripe; refresh deliberately replaces only
            the model entitlement snapshot from the current plan.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-2">
          {subscriptions.length === 0 ? (
            <p className="text-xs text-muted">No subscriptions yet.</p>
          ) : (
            subscriptions.map((subscription) => {
              const latest = subscription.invoices[0];

              return (
                <div
                  key={subscription.id}
                  className="rounded-xl border border-black/10 p-3 text-xs dark:border-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {subscription.customerName}
                        </span>
                        <Chip color={statusColor(subscription.status)}>
                          {subscription.status.replace("_", " ")}
                        </Chip>
                        <span className="text-muted">
                          {subscription.source}
                        </span>
                      </div>
                      <p className="mt-1 text-muted">
                        {subscription.customerEmail} · {subscription.plan.name}{" "}
                        · {formatMicros(subscription.plan.priceMicros)} /{" "}
                        {subscription.plan.interval}
                      </p>
                      <p className="mt-1 text-muted">
                        <LocalTime value={subscription.currentPeriodStart} /> →{" "}
                        <LocalTime value={subscription.currentPeriodEnd} /> ·{" "}
                        {formatCompact(
                          subscription.allowance.usedWeightedTokens,
                        )}{" "}
                        /{" "}
                        {formatCompact(
                          subscription.plan.includedWeightedTokens,
                        )}{" "}
                        weighted tokens used ·{" "}
                        {subscription.cancelAtPeriodEnd
                          ? "cancels at period end"
                          : "renews"}
                      </p>
                      <p className="mt-1 text-muted">
                        {subscription.entitlementCount} included models ·{" "}
                        {subscription.plan.overageMode === "block"
                          ? "overage blocked"
                          : `overage +${formatRatePercent(subscription.plan.overageMarkupBps)}`}
                        {latest
                          ? ` · latest invoice ${latest.status} ${formatMicros(latest.amountMicros)}`
                          : " · no invoice"}
                      </p>
                      {subscription.entitlementCount === 0 ? (
                        <p className="mt-1 text-warning">
                          Zero entitlements — this subscription covers no
                          models. Refresh or inspect the plan.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      {subscription.source === "manual" ? (
                        <>
                          <Input
                            aria-label={`Extend ${subscription.customerEmail}`}
                            className="w-36"
                            type="date"
                            value={extendDates[subscription.id] ?? ""}
                            onChange={(event) =>
                              setExtendDates((current) => ({
                                ...current,
                                [subscription.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            isDisabled={busy !== null}
                            size="sm"
                            variant="secondary"
                            onPress={() =>
                              act({
                                key: `extend:${subscription.id}`,
                                body: {
                                  action: "extend",
                                  id: subscription.id,
                                  periodEnd: extendDates[subscription.id]
                                    ? new Date(
                                        `${extendDates[subscription.id]}T23:59:59.000Z`,
                                      ).toISOString()
                                    : null,
                                },
                                message: "Subscription period extended.",
                              })
                            }
                          >
                            Extend
                          </Button>
                        </>
                      ) : null}
                      {subscription.source === "stripe" ? (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() =>
                            act({
                              key: `sync:${subscription.id}`,
                              body: { action: "sync", id: subscription.id },
                              message: "Subscription synced from Stripe.",
                            })
                          }
                        >
                          Sync
                        </Button>
                      ) : null}
                      <Button
                        isDisabled={busy !== null}
                        size="sm"
                        variant="secondary"
                        onPress={() =>
                          act({
                            key: `refresh:${subscription.id}`,
                            body: {
                              action: "refresh_entitlements",
                              id: subscription.id,
                            },
                            message:
                              "Entitlements refreshed from the current plan.",
                          })
                        }
                      >
                        Refresh
                      </Button>
                      {confirmRevoke === subscription.id ? (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="primary"
                          onPress={() => {
                            setConfirmRevoke(null);
                            void act({
                              key: `revoke:${subscription.id}`,
                              body: { action: "revoke", id: subscription.id },
                              message: "Subscription revoked immediately.",
                            });
                          }}
                        >
                          Confirm revoke
                        </Button>
                      ) : (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() => setConfirmRevoke(subscription.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
