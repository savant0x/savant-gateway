import type { DailyTrialSummary } from "@/lib/storage/store/daily-trial";
import type { TrialBalance } from "@/lib/storage/ledger/trials";
import type { ModelSummary } from "@/lib/types";
import type { ReactNode } from "react";

import Link from "next/link";

import { FreeAllocationCheck } from "./free-allocation-check";
import {
  FreeAllocationGuide,
  type FreeAllocationMode,
} from "./free-allocation-guide";

import { formatNumber } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";
import { rawTokensForWeight } from "@/lib/free-pool";

type Props = {
  mode: FreeAllocationMode;
  model: ModelSummary;
  signedIn: boolean;
  daily: DailyTrialSummary | null;
  lifetime: TrialBalance | null;
  unavailable: boolean;
};

function effectiveWeight(model: ModelSummary) {
  return Math.max(1, Math.floor(model.tokenWeight) || 1);
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-black/10 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted">{detail}</p>
    </div>
  );
}

function Facts({
  daily,
  mode,
  model,
}: {
  daily: DailyTrialSummary | null;
  mode: FreeAllocationMode;
  model: ModelSummary;
}) {
  const weight = effectiveWeight(model);

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Stat
        detail={
          mode === "daily"
            ? "A capped share of observed upstream capacity, not unlimited use."
            : "A single grant that is not replenished and does not reset."
        }
        label="Access"
        value={mode === "daily" ? "Shared pool" : "One-time trial"}
      />
      <Stat
        detail="Every raw input and output token costs this many weighted tokens."
        label="Weight on this model"
        value={`${weight}×`}
      />
      <Stat
        detail={
          mode === "daily"
            ? "Daily at 00:00 UTC. Unused allocation does not carry over."
            : "The trial lasts until used; there is no daily reset."
        }
        label="Reset"
        value={
          mode === "daily" && daily?.resetsAt ? (
            <LocalTime value={daily.resetsAt} />
          ) : mode === "daily" ? (
            "00:00 UTC"
          ) : (
            "Never"
          )
        }
      />
      <Stat
        detail={
          mode === "daily"
            ? "A plan overage or a trial fallback follows its own policy; the free-pool path does not charge it."
            : "An exhausted trial may settle on the configured paid pair when credit covers it."
        }
        label="Prepaid credit"
        value={mode === "daily" ? "Separate" : "Fallback only"}
      />
    </div>
  );
}

function RawEquivalent({
  model,
  remaining,
}: {
  model: ModelSummary;
  remaining: number;
}) {
  const weight = effectiveWeight(model);

  return (
    <p className="mt-3 rounded-lg border border-emerald-300/15 bg-emerald-400/5 p-3 text-xs leading-5 text-muted">
      At {weight}× weight, that balance covers about{" "}
      <strong className="text-foreground">
        {formatNumber(rawTokensForWeight(remaining, weight))}
      </strong>{" "}
      raw input-plus-output tokens on this model. Other free SKUs draw on the
      same balance at their own weight.
    </p>
  );
}

function DailyStats({
  daily,
  model,
  remaining,
}: {
  daily: DailyTrialSummary;
  model: ModelSummary;
  remaining: number;
}) {
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat
          detail="Weighted tokens available across every free model."
          label="Available now"
          value={formatNumber(remaining)}
        />
        <Stat
          detail="Your recorded allowance for today."
          label="Allocated today"
          value={formatNumber(daily.allocatedTokens)}
        />
        <Stat
          detail="Settled weighted tokens today, across free models."
          label="Used today"
          value={formatNumber(daily.usedTokens)}
        />
        <Stat
          detail="Held for requests still in flight; unused holds return."
          label="In flight"
          value={formatNumber(daily.heldTokens)}
        />
      </div>
      <RawEquivalent model={model} remaining={remaining} />
    </>
  );
}

function LifetimeStats({
  lifetime,
  model,
}: {
  lifetime: TrialBalance;
  model: ModelSummary;
}) {
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat
          detail="Weighted tokens left in your one-time trial."
          label="Available now"
          value={formatNumber(lifetime.remaining)}
        />
        <Stat
          detail="The full grant issued to this account."
          label="Granted"
          value={formatNumber(lifetime.granted)}
        />
        <Stat
          detail="Settled weighted tokens across free models."
          label="Used"
          value={formatNumber(lifetime.used)}
        />
        <Stat
          detail="Held for requests still in flight; unused holds return."
          label="In flight"
          value={formatNumber(lifetime.held)}
        />
      </div>
      <RawEquivalent model={model} remaining={lifetime.remaining} />
    </>
  );
}

function AllocationStatus({
  daily,
  lifetime,
  mode,
  signedIn,
  unavailable,
}: Omit<Props, "model">) {
  if (!signedIn) {
    return (
      <p className="mt-4 text-sm leading-6 text-muted">
        Sign in to see your own allowance. Every free call is metered in
        weighted tokens, and an account needs an active scoped key before it can
        use the free allocation.
      </p>
    );
  }

  if (unavailable) {
    return (
      <p className="mt-4 text-sm leading-6 text-amber-200">
        We could not read your allocation just now. Nothing was changed or
        charged; open your account to retry.
      </p>
    );
  }

  if (mode === "lifetime") {
    return (
      <p className="mt-4 text-sm leading-6 text-muted">
        {lifetime && lifetime.granted > 0 ? (
          <>
            You have{" "}
            <strong className="text-foreground">
              {formatNumber(lifetime.remaining)}
            </strong>{" "}
            weighted tokens left in your one-time trial, shared across every
            free model and every key on your account. A request the trial cannot
            cover may continue on the configured paid pair from prepaid credit.
          </>
        ) : (
          "No one-time trial grant has been issued. A verified account and available acquisition capacity are required. Calls may still use the configured paid pair if credit covers them."
        )}
      </p>
    );
  }

  if (!daily) {
    return (
      <p className="mt-4 text-sm leading-6 text-muted">
        No daily allocation record is available for this account. Open your
        account to check the current state.
      </p>
    );
  }

  if (!daily.activated) {
    return (
      <p className="mt-4 text-sm leading-6 text-amber-200">
        Create an active API key to take part in today&apos;s allocation. An
        account with no active key is not counted in the daily split.
      </p>
    );
  }

  if (!daily.available || daily.remainingTokens === null) {
    return (
      <p className="mt-4 text-sm leading-6 text-amber-200">
        Fresh upstream capacity is not available, so free-pool calls are not
        admitted right now. Your used and reserved totals are unchanged; check
        your account for a new observation.
      </p>
    );
  }

  return (
    <p className="mt-4 text-sm leading-6 text-muted">
      You have{" "}
      <strong className="text-foreground">
        {formatNumber(daily.remainingTokens)}
      </strong>{" "}
      weighted tokens available now, shared across every free model and every
      key on your account.
    </p>
  );
}

/**
 * The free SKU detail panel. It shows only the signed-in customer's own
 * allocation; pool sizes, account caps and other operator policy stay out of
 * the public page. `remainingTokens !== null` is the display gate because a
 * stale or missing observation must never read as a real zero balance.
 */
export function FreeAllocationPanel({
  daily,
  lifetime,
  mode,
  model,
  signedIn,
  unavailable,
}: Props) {
  const showDaily =
    signedIn &&
    !unavailable &&
    mode === "daily" &&
    daily?.available === true &&
    daily.activated &&
    daily.remainingTokens !== null;
  const showLifetime =
    signedIn &&
    !unavailable &&
    mode === "lifetime" &&
    lifetime !== null &&
    lifetime.granted > 0;

  return (
    <section
      aria-labelledby="free-allocation-title"
      className="rounded-xl border border-emerald-300/20 bg-surface p-5"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300">
        Free allocation
      </p>
      <h2
        className="mt-2 text-xl font-semibold tracking-[-0.02em]"
        id="free-allocation-title"
      >
        How your free usage works on this model
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {mode === "daily"
          ? "This SKU has no per-token dollar charge. Calls are metered in weighted tokens against your allocation, and the balance below is the same one admission uses. Free-pool admission does not draw on prepaid credit."
          : "This SKU is part of the one-time trial. Calls are metered in weighted tokens against your trial, and the balance below is the same one admission uses. When the trial cannot cover a call, the configured paid pair may settle it from prepaid credit."}
      </p>

      <AllocationStatus
        daily={daily}
        lifetime={lifetime}
        mode={mode}
        signedIn={signedIn}
        unavailable={unavailable}
      />

      {signedIn ? <FreeAllocationCheck /> : null}

      {showDaily && daily && daily.remainingTokens !== null ? (
        <DailyStats
          daily={daily}
          model={model}
          remaining={daily.remainingTokens}
        />
      ) : showLifetime && lifetime ? (
        <LifetimeStats lifetime={lifetime} model={model} />
      ) : (
        <Facts daily={daily} mode={mode} model={model} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {signedIn ? (
          <Link
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            href="/account"
          >
            Open your account
          </Link>
        ) : (
          <>
            <Link
              className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              href="/signup"
            >
              Create an account
            </Link>
          </>
        )}
      </div>

      <FreeAllocationGuide mode={mode} model={model} signedIn={signedIn} />
    </section>
  );
}
