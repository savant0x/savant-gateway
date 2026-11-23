"use client";

import type {
  EligibilityDecision,
  ProviderReviewModel,
} from "@/lib/providers/eligibility";

import { Button, Spinner } from "@heroui/react";

import { formatNumber } from "@/components/dashboard/format";

/**
 * The one-gesture review for a whole catalog.
 *
 * A review-required provider needs a dated chat decision per model, and a synced
 * catalog is hundreds of rows. The counts are visible before anything is pressed,
 * and the button text is the decision it records, so the gesture is as explicit as
 * the per-row one it replaces. Each press is a single request.
 */
export function EligibilityBulkActions({
  slug,
  models,
  undecided,
  busy,
  onDecide,
}: {
  slug: string;
  models: ProviderReviewModel[];
  undecided: ProviderReviewModel[];
  busy: string | null;
  onDecide: (
    label: string,
    selection: ProviderReviewModel[],
    decision: EligibilityDecision,
  ) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-default-200 px-3 py-2">
      <p className="mr-1 text-[11px] text-muted">
        {formatNumber(undecided.length)} of {formatNumber(models.length)} rows
        have no chat decision. A decision is your judgement about the
        vendor&apos;s catalog, never inferred from it.
      </p>
      <Button
        isDisabled={busy !== null || undecided.length === 0}
        size="sm"
        variant="primary"
        onPress={() => onDecide("undecided", undecided, "chat")}
      >
        {busy === "bulk:chat" ? <Spinner size="sm" /> : null}
        All {formatNumber(undecided.length)} undecided → chat
      </Button>
      <Button
        isDisabled={busy !== null}
        size="sm"
        variant="secondary"
        onPress={() => onDecide("every row", models, "chat")}
      >
        All {formatNumber(models.length)} rows → chat
      </Button>
      <Button
        isDisabled={busy !== null || undecided.length === 0}
        size="sm"
        variant="secondary"
        onPress={() => onDecide("undecided", undecided, "unsupported")}
      >
        Undecided → unsupported
      </Button>
      <p className="text-[11px] text-muted">{slug} · one request per press</p>
    </div>
  );
}
