"use client";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";
import {
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  TOPUP_PRESETS_USD,
} from "@/lib/topup-amount";

export function TopupCard({
  configured,
  reason,
}: {
  configured: boolean;
  reason: string | null;
}) {
  const [amount, setAmount] = useState("25");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTopup() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amount }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as { url?: string };
      const url = payload.url ? new URL(payload.url) : null;

      if (!url || url.protocol !== "https:") {
        throw new Error("Checkout returned an invalid URL.");
      }

      window.location.assign(url.toString());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start checkout.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Add credit</Card.Title>
        <Card.Description>
          Prepaid balance for paid models. Free-pool models never debit it.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        {configured ? (
          <>
            <div className="flex flex-wrap gap-2">
              {TOPUP_PRESETS_USD.map((preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant={amount === String(preset) ? "primary" : "secondary"}
                  onPress={() => setAmount(String(preset))}
                >
                  ${preset}
                </Button>
              ))}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="text-muted">Custom amount (USD)</span>
              <Input
                aria-label="Top-up amount in US dollars"
                className="w-full"
                inputMode="decimal"
                placeholder="25.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className="block text-[11px] text-muted">
                ${TOPUP_MIN_USD}–${TOPUP_MAX_USD}, two decimal places.
              </span>
            </label>

            <Button
              className="w-full"
              isDisabled={submitting}
              variant="primary"
              onPress={handleTopup}
            >
              {submitting ? <Spinner size="sm" /> : null}
              {submitting ? "Opening Stripe" : "Continue to Stripe"}
            </Button>

            <p className="text-[11px] leading-5 text-muted">
              Payment is completed on Stripe&apos;s hosted page. This app never
              sees card data. Credit is added only after Stripe&apos;s signed
              webhook confirms the payment, so a cancelled or unpaid checkout
              cannot credit the account.
            </p>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {reason ?? "Payments are not configured on this server."}
            </p>
            <p className="text-xs leading-5 text-muted">
              Add both Stripe values to{" "}
              <code className="mono text-foreground">.env.local</code> and
              restart. Then forward test events locally:
            </p>
            <pre className="scroll-shell rounded-xl bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
              <code>{`STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

stripe listen --forward-to localhost:3000/api/webhooks/stripe`}</code>
            </pre>
            <p className="text-xs text-muted">
              No fake credit path is exposed while payments are unconfigured.
            </p>
          </div>
        )}

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
