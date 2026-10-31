"use client";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";
import {
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  TOPUP_PRESETS_USD,
} from "@/lib/topup-amount";

export type TopupLane = {
  id: "crypto" | "card";
  name: string;
  endpoint: string;
  available: boolean;
  /** Why the lane is closed; null while the lane is available. */
  reason: string | null;
};

export function TopupCard({ lanes }: { lanes: TopupLane[] }) {
  const [amount, setAmount] = useState("25");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openLanes = lanes.filter((lane) => lane.available);
  const closedLanes = lanes.filter((lane) => !lane.available);

  async function handleTopup(lane: TopupLane) {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(lane.endpoint, {
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
        {openLanes.length > 0 ? (
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

            <div className="space-y-2">
              {openLanes.map((lane) => (
                <Button
                  key={lane.id}
                  className="w-full"
                  isDisabled={submitting}
                  variant="primary"
                  onPress={() => handleTopup(lane)}
                >
                  {submitting ? <Spinner size="sm" /> : null}
                  {submitting
                    ? `Opening ${lane.name} checkout`
                    : `Continue with ${lane.name}`}
                </Button>
              ))}
            </div>

            <p className="text-[11px] leading-5 text-muted">
              Payment is completed on the payment provider&apos;s hosted page.
              This app never sees card or crypto keys. Credit is added only
              after the provider&apos;s signed webhook confirms the payment, so
              a cancelled or unpaid checkout cannot credit the account.
            </p>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Prepaid credit is not open yet.
            </p>
            {closedLanes.map((lane) => (
              <p key={lane.id} className="text-xs leading-5 text-muted">
                {lane.reason}
              </p>
            ))}
            <p className="text-xs leading-5 text-muted">
              You can create project keys and use the free-pool models now.
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
