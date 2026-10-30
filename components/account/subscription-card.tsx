"use client";

import type { SubscriptionSummary } from "@/lib/types";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LocalTime } from "@/components/local-time";
import {
  formatCompact,
  formatMicros,
  formatRatePercent,
  responseError,
} from "@/components/dashboard/format";

function statusColor(status: SubscriptionSummary["status"]) {
  if (status === "active") return "success" as const;
  if (status === "past_due") return "warning" as const;
  if (status === "incomplete") return "default" as const;

  return "danger" as const;
}

export function SubscriptionCard({
  subscription,
  stripeConfigured,
  salesEnabled,
}: {
  subscription: SubscriptionSummary | null;
  stripeConfigured: boolean;
  /** False while the launch policy keeps new plan sales closed. */
  salesEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, key: string) {
    setBusy(key);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as { url?: string };

      if (payload.url) {
        window.location.assign(payload.url);

        return;
      }

      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update the plan.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!subscription) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>Subscription</Card.Title>
          <Card.Description>
            Optional plans cover included models without touching prepaid
            credit.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-3 text-sm">
          <p className="text-xs leading-5 text-muted">
            No plan is attached to this account. Prepaid credit and free-pool
            models continue to work as before.
          </p>
          {salesEnabled ? (
            <Link
              className="inline-flex rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent/20"
              href="/plans"
            >
              Compare plans
            </Link>
          ) : (
            <p className="text-xs leading-5 text-muted">
              Plans are not on sale during this launch. Nothing is charged and
              no plan can be started from here.
            </p>
          )}
        </Card.Content>
      </Card>
    );
  }

  const { plan, allowance } = subscription;
  const ended =
    subscription.status === "canceled" || subscription.status === "expired";

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>{plan.name}</Card.Title>
            <Card.Description>
              {formatMicros(plan.priceMicros)} / {plan.interval} ·{" "}
              {subscription.source === "manual" ? "Operator grant" : "Stripe"}
            </Card.Description>
          </div>
          <Chip color={statusColor(subscription.status)}>
            {subscription.status.replace("_", " ")}
          </Chip>
        </div>
      </Card.Header>

      <Card.Content className="space-y-4 text-sm">
        {subscription.status === "past_due" ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Payment failed. Included calls are paused until a paid invoice
            reactivates this subscription.
          </p>
        ) : null}

        {subscription.cancelAtPeriodEnd && !ended ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Cancels at period end. Access remains until{" "}
            <LocalTime value={subscription.currentPeriodEnd} />.
          </p>
        ) : null}

        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Current period</dt>
            <dd>
              <LocalTime value={subscription.currentPeriodStart} /> →{" "}
              <LocalTime value={subscription.currentPeriodEnd} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Included models</dt>
            <dd>{subscription.entitlementCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Allowance</dt>
            <dd>
              {formatCompact(allowance.usedWeightedTokens)} /{" "}
              {formatCompact(allowance.includedWeightedTokens)} weighted tokens
            </dd>
          </div>
          <div>
            <dt className="text-muted">Remaining</dt>
            <dd>{formatCompact(allowance.remainingWeightedTokens)}</dd>
          </div>
          <div>
            <dt className="text-muted">Overage</dt>
            <dd>
              {plan.overageMode === "block"
                ? "Blocked at the limit"
                : `Credit at list price${plan.overageMarkupBps > 0 ? ` + ${formatRatePercent(plan.overageMarkupBps)}` : ""}`}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Held by live calls</dt>
            <dd>{formatCompact(allowance.heldWeightedTokens)}</dd>
          </div>
        </dl>

        <div
          aria-label="Allowance used"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(allowance.usedBps / 100)}
          className="h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-cyan-300"
            style={{ width: `${Math.min(100, allowance.usedBps / 100)}%` }}
          />
        </div>

        {subscription.invoices.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium">Recent invoices</p>
            {subscription.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10"
              >
                <span>
                  <LocalTime value={invoice.createdAt} />
                </span>
                <span>{formatMicros(invoice.amountMicros)}</span>
                <span className="text-muted">{invoice.status}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {" "}
          {(subscription.status === "active" ||
            subscription.status === "past_due") &&
          subscription.cancelAtPeriodEnd ? (
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={() => act("/api/account/subscription/resume", "resume")}
            >
              {busy === "resume" ? <Spinner size="sm" /> : null}
              Resume
            </Button>
          ) : null}{" "}
          {(subscription.status === "active" ||
            subscription.status === "past_due") &&
          !subscription.cancelAtPeriodEnd ? (
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={() => act("/api/account/subscription/cancel", "cancel")}
            >
              {busy === "cancel" ? <Spinner size="sm" /> : null}
              Cancel at period end
            </Button>
          ) : null}
          {stripeConfigured && subscription.stripeCustomerId ? (
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={() => act("/api/account/subscription/portal", "portal")}
            >
              {busy === "portal" ? <Spinner size="sm" /> : null}
              Billing portal
            </Button>
          ) : null}
          <Link
            className="inline-flex items-center rounded-xl px-3 py-2 text-xs text-accent hover:underline"
            href="/plans"
          >
            View plans
          </Link>
        </div>

        {subscription.source === "manual" ? (
          <p className="text-[11px] leading-5 text-muted">
            Operator grants do not auto-renew. Ask the operator to extend the
            period before it ends.
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </Card.Content>
    </Card>
  );
}
