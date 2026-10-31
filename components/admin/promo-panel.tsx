"use client";

import type { PromoCodeSummary, PromoStatus } from "@/lib/promo-codes";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMicros, responseError } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";

const FIELD_CLASS =
  "w-full rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent dark:border-white/10";

function localInputToIso(value: string) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function statusColor(status: PromoStatus) {
  if (status === "active") return "success" as const;
  if (status === "paused") return "warning" as const;

  return "default" as const;
}

export function PromoPanel({
  enabled,
  reason,
  initial,
}: {
  enabled: boolean;
  reason: string | null;
  initial: PromoCodeSummary[];
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initial);
  const [amount, setAmount] = useState("5");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [label, setLabel] = useState("Promo credit");
  const [manualCode, setManualCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    setCreatedCode(null);

    try {
      const amountUsd = Number(amount);
      const cap = Number(maxRedemptions);

      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        throw new Error("Enter a positive dollar amount.");
      }

      if (!Number.isSafeInteger(cap) || cap < 1) {
        throw new Error("Redemptions must be a whole number of at least 1.");
      }

      const response = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          maxRedemptions: cap,
          label,
          code: manualCode.trim() || undefined,
          expiresAt: localInputToIso(expiresAt) ?? undefined,
        }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as {
        code: string;
        promo: PromoCodeSummary;
      };

      setCodes((current) => [payload.promo, ...current]);
      setCreatedCode(payload.code);
      setManualCode("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the promo.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: PromoStatus) {
    setBusyId(id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/promos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      setCodes((current) =>
        current.map((code) => (code.id === id ? { ...code, status } : code)),
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not change the status.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card id="promos">
      <Card.Header>
        <Card.Title>Promo credit</Card.Title>
        <Card.Description>
          Codes grant prepaid dollar credit into the same ledger Stripe uses.
          The full code is shown once at creation; only a hash is stored.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        {enabled ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            Redemption is open. Customers see the promo card on /account.
          </p>
        ) : (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Redemption is closed. Set{" "}
            <span className="mono">PROMO_CODES_ENABLED=true</span> and restart
            to open it. {reason}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label
            className="space-y-1 text-xs text-muted"
            htmlFor="promo-amount"
          >
            <span>Credit amount (USD)</span>
            <Input
              aria-label="Promo credit amount in USD"
              id="promo-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted" htmlFor="promo-cap">
            <span>Redemptions</span>
            <Input
              aria-label="Maximum redemptions"
              id="promo-cap"
              inputMode="numeric"
              value={maxRedemptions}
              onChange={(event) => setMaxRedemptions(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted" htmlFor="promo-label">
            <span>Label</span>
            <Input
              aria-label="Promo label"
              id="promo-label"
              maxLength={80}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Expires (optional)</span>
            <input
              aria-label="Promo expiry"
              className={FIELD_CLASS}
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Manual promo code"
            className="w-full font-mono uppercase"
            maxLength={17}
            placeholder="Manual code (optional)"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
          />
          <Button
            className="shrink-0"
            isDisabled={creating}
            variant="primary"
            onPress={create}
          >
            {creating ? <Spinner size="sm" /> : null}
            {creating ? "Creating" : "Create code"}
          </Button>
        </div>

        {createdCode ? (
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
              New code — shown once
            </p>
            <p className="mono mt-1 text-lg font-semibold tracking-[0.08em]">
              {createdCode}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Copy it now. It cannot be retrieved after this page reloads.
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {codes.length === 0 ? (
          <p className="rounded-xl bg-surface p-3 text-xs text-muted">
            No promo codes issued yet.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Amount</th>
                  <th>Used</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <div className="mono text-xs">{code.codePrefix}…</div>
                      <div className="text-[11px] text-muted">{code.label}</div>
                    </td>
                    <td>{formatMicros(code.amountMicros)}</td>
                    <td className="text-muted">
                      {code.redeemedCount} / {code.maxRedemptions}
                    </td>
                    <td className="text-xs text-muted">
                      {code.startsAt ? (
                        <div>
                          from <LocalTime value={code.startsAt} />
                        </div>
                      ) : null}
                      {code.expiresAt ? (
                        <div>
                          until <LocalTime value={code.expiresAt} />
                        </div>
                      ) : null}
                      {!code.startsAt && !code.expiresAt ? "No expiry" : null}
                    </td>
                    <td>
                      <Chip color={statusColor(code.status)} size="sm">
                        {code.status}
                      </Chip>
                    </td>
                    <td className="text-right">
                      {code.status === "active" ? (
                        <Button
                          isDisabled={busyId === code.id}
                          size="sm"
                          variant="secondary"
                          onPress={() => setStatus(code.id, "paused")}
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          isDisabled={busyId === code.id}
                          size="sm"
                          variant="secondary"
                          onPress={() => setStatus(code.id, "active")}
                        >
                          Activate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
