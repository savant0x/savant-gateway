"use client";

import type { AdmissionState } from "@/lib/operations";
import type { OperationsOverview } from "./operations-overview";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OperationsCards } from "./operations-cards";
import {
  OperationsIncidents,
  OperationsProviders,
} from "./operations-incidents";

import { responseError } from "@/components/dashboard/format";

export function OperationsPanel({ initial }: { initial: OperationsOverview }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: Record<string, unknown>, message: string) {
    setBusy(String(action.action));
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as OperationsOverview & {
        tick?: {
          active: number;
          opened: number;
          reopened: number;
          resolved: number;
          delivered: number;
          failed: number;
          unconfigured: number;
        };
      };

      setOverview(payload);
      setNotice(
        payload.tick
          ? `${message} ${payload.tick.active} active, ${payload.tick.opened} opened, ` +
              `${payload.tick.resolved} resolved, ${payload.tick.delivered} delivered, ` +
              `${payload.tick.failed} failed, ${payload.tick.unconfigured} unconfigured.`
          : message,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  function setState(state: AdmissionState) {
    void run(
      { action: state === "open" ? "resume" : state, reason },
      state === "open"
        ? "Admission is open."
        : state === "paused"
          ? "Admission is paused."
          : "Admission is draining.",
    );
  }

  return (
    <div className="space-y-5">
      <OperationsCards overview={overview} />

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Admission controls</Card.Title>
          <Card.Description>
            Pause or drain refuses new inference before any rate limit, provider
            slot, allowance hold or credit hold. It does not stop signed payment
            webhooks, settlement, quarantine release or in-flight streams.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-3">
          <Input
            aria-label="Reason for the admission change"
            className="max-w-xl"
            placeholder="Reason required for pause or drain"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={
                busy !== null || overview.admission.state === "paused"
              }
              variant="primary"
              onPress={() => setState("paused")}
            >
              {busy === "pause" ? <Spinner size="sm" /> : null}
              Pause admission
            </Button>
            <Button
              isDisabled={
                busy !== null || overview.admission.state === "draining"
              }
              variant="secondary"
              onPress={() => setState("draining")}
            >
              {busy === "drain" ? <Spinner size="sm" /> : null}
              Drain admission
            </Button>
            <Button
              isDisabled={busy !== null || overview.admission.state === "open"}
              variant="secondary"
              onPress={() => setState("open")}
            >
              {busy === "resume" ? <Spinner size="sm" /> : null}
              Resume admission
            </Button>
            <Button
              isDisabled={busy !== null}
              variant="secondary"
              onPress={() => run({ action: "tick" }, "Monitor run complete.")}
            >
              {busy === "tick" ? <Spinner size="sm" /> : null}
              Run monitor now
            </Button>
          </div>
          <p aria-live="polite" className="min-h-4 text-xs text-muted">
            {error ? <span className="text-danger">{error}</span> : notice}
          </p>
        </Card.Content>
      </Card>

      <OperationsIncidents
        busy={busy}
        incidents={overview.incidents}
        onAcknowledge={(id) =>
          run({ action: "acknowledge", id }, "Incident acknowledged.")
        }
      />

      <OperationsProviders
        busy={busy}
        providers={overview.providers}
        onToggle={(provider) =>
          run(
            {
              action: "provider",
              slug: provider.slug,
              enabled: !provider.enabled,
            },
            provider.enabled
              ? `${provider.label} disabled.`
              : `${provider.label} enabled.`,
          )
        }
      />
    </div>
  );
}
