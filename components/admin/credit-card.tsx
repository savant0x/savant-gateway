"use client";

import type { AccountSummary, CreditLedgerEntry } from "@/lib/types";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDate, formatMicros } from "@/components/dashboard/format";

export function CreditCard({
  account,
  ledger,
}: {
  account: AccountSummary;
  ledger: CreditLedgerEntry[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGrant() {
    setGranting(true);
    setError(null);
    setNotice(null);

    try {
      const amountUsd = Number(amount);

      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        throw new Error("Enter a positive dollar amount.");
      }

      const response = await fetch("/api/admin/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, note }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        account?: AccountSummary;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || `Credit grant failed (HTTP ${response.status})`,
        );
      }

      setNotice(
        `Grant applied. Balance is now ${formatMicros(payload?.account?.creditMicros)}.`,
      );
      setNote("");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not grant the credit.",
      );
    } finally {
      setGranting(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Tenant credit</Card.Title>
            <Card.Description>
              Paid requests reserve and settle against this balance. Free-pool
              calls never debit it.
            </Card.Description>
          </div>
          <span className="rounded-xl border border-black/10 bg-surface px-3 py-1.5 text-lg font-semibold dark:border-white/10">
            {formatMicros(account.availableMicros)}
          </span>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Granted balance</p>
            <p className="mt-1 text-sm font-semibold">
              {formatMicros(account.creditMicros)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Held by live calls</p>
            <p className="mt-1 text-sm font-semibold">
              {formatMicros(account.heldMicros)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Available</p>
            <p className="mt-1 text-sm font-semibold text-success">
              {formatMicros(account.availableMicros)}
            </p>
          </div>
        </div>

        {account.creditMicros < 0 ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <i
              aria-hidden
              className="fa-solid fa-triangle-exclamation mr-1.5"
            />
            In-flight usage exceeded the reservation. The balance is negative
            and paid calls stay blocked until it is funded.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Grant amount in USD"
            className="w-full sm:max-w-[9rem]"
            placeholder="10.00"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <Input
            aria-label="Credit note"
            className="w-full"
            placeholder="Note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            className="shrink-0"
            isDisabled={granting}
            variant="primary"
            onPress={handleGrant}
          >
            {granting ? <Spinner size="sm" /> : null}
            {granting ? "Granting" : "Grant credit"}
          </Button>
        </div>

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

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
            Recent grants
          </p>
          {ledger.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-xs text-muted">
              No grants yet. Paid models cannot run until credit is added.
            </p>
          ) : (
            ledger.slice(0, 5).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2 text-muted">
                  <i
                    aria-hidden
                    className="fa-solid fa-plus text-[10px] text-success"
                  />
                  {entry.note ?? entry.kind}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-success">
                    +{formatMicros(entry.amountMicros)}
                  </span>
                  <span className="text-muted">
                    {formatDate(entry.createdAt)}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        <p className="text-[11px] text-muted">
          Grants are audited in `credit_ledger`. Holds are admission control;
          settlement debits actual usage, so a provider token report above the
          estimate can overdraw the balance. Checkout and customer self-service
          top-ups are not implemented in this build.
        </p>
      </Card.Content>
    </Card>
  );
}
