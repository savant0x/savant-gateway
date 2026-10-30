"use client";

import type { DailyTrialSummary } from "@/lib/store/daily-trial";

import { Button } from "@heroui/react";

import { LocalTime } from "@/components/local-time";
import { formatNumber } from "@/components/dashboard/format";
import { useAccountCheck } from "@/components/dashboard/use-provider-runtime";
import { observationIsRecent } from "@/lib/provider-quota";

export function DailyTrialBalance({ initial }: { initial: DailyTrialSummary }) {
  const live = useAccountCheck(initial, "/api/account/trial", "trial");
  const value = live.value;
  const current =
    value?.available &&
    observationIsRecent(value.observedAt, live.now) &&
    value.resetsAt !== null &&
    Date.parse(value.resetsAt) > live.now;
  const trial = current ? value : null;

  return (
    <section className="rounded-md border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold">Daily trial credits</h2>
      <p className="mt-2 text-muted">
        {!trial
          ? "Current upstream capacity is unavailable. Credits cannot be used until a new check succeeds."
          : !trial.activated
            ? "Create an API key to activate your daily allocation."
            : `${formatNumber(trial.remainingTokens)} weighted-token credits available · ${formatNumber(trial.usedTokens)} used · ${formatNumber(trial.heldTokens)} reserved.`}
      </p>
      <p className="mt-3 text-sm text-muted">
        Your allocation is shared across your keys and comes from the
        provider-wide daily sandbox pool. It adjusts with activated accounts and
        observed capacity, keeps a safety reserve, and is separate from prepaid
        dollar credit. Each request checks upstream capacity and reserves
        estimated usage before it runs.
      </p>
      {trial?.resetsAt ? (
        <p className="mt-3 text-sm text-muted">
          Upstream reset: <LocalTime value={trial.resetsAt} />. Credits do not
          carry over; a new upstream observation is required before allocation
          after reset.
        </p>
      ) : null}
      {trial?.checkedAt ? (
        <p className="mt-2 text-xs text-muted">
          Account checked: <LocalTime value={trial.checkedAt} />
        </p>
      ) : null}
      <Button
        className="mt-3"
        isDisabled={live.checking}
        variant="secondary"
        onPress={() => void live.refresh()}
      >
        {live.checking ? "Checking upstream…" : "Check trial credits"}
      </Button>
      <p className="mt-2 text-xs text-muted">
        Checks every 15 seconds while visible. Values clear during checks or
        failures.
      </p>
    </section>
  );
}
