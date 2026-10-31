"use client";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMicros, responseError } from "@/components/dashboard/format";

export function PromoCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function redeem() {
    setRedeeming(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/account/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as { amountMicros: number };

      setNotice(
        `${formatMicros(payload.amountMicros)} was added to your prepaid balance.`,
      );
      setCode("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not redeem the code.",
      );
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Redeem a promo code</Card.Title>
        <Card.Description>
          A code adds prepaid credit once. The credited dollars do not expire;
          the code itself may.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3">
        <label className="block space-y-1.5 text-sm" htmlFor="promo-code">
          <span className="text-muted">Promo code</span>
          <Input
            aria-label="Promo code"
            autoComplete="off"
            className="w-full font-mono uppercase"
            id="promo-code"
            maxLength={17}
            placeholder="XXXX-XXXX-XXXX"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>

        {error ? (
          <p
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <Button
          className="w-full"
          isDisabled={redeeming || !code.trim()}
          variant="primary"
          onPress={redeem}
        >
          {redeeming ? <Spinner size="sm" /> : null}
          {redeeming ? "Redeeming" : "Add promo credit"}
        </Button>

        <p className="text-[11px] leading-5 text-muted">
          One redemption per account per code. Promo credit is ordinary prepaid
          balance and is spent by paid models; free-pool calls never touch it.
        </p>
      </Card.Content>
    </Card>
  );
}
