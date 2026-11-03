import type { ReactNode } from "react";

import { SURFACE_STATE_LABELS, type SurfaceState } from "@/lib/surface-state";

/**
 * The shared surface-state contract (FID-2026-1103-134).
 *
 * "Nothing here" is not one condition. A zero-result filter, a feature the
 * operator disabled, an unreadable store, and a surface that has not loaded yet
 * need different labels and different next actions. The panel keeps the copy
 * honest and makes the distinction available to assistive technology.
 */

const TONE_CLASSES: Record<SurfaceState, string> = {
  empty:
    "border-dashed border-black/15 bg-surface text-muted dark:border-white/15",
  disabled: "border-black/10 bg-black/[0.02] text-muted dark:border-white/10",
  unavailable: "border-danger/30 bg-danger/10 text-danger",
  loading: "border-black/10 bg-surface text-muted dark:border-white/10",
};

export function StatePanel({
  state,
  title,
  description,
  action,
  timestamp,
  className = "",
}: {
  state: SurfaceState;
  title?: string;
  description: ReactNode;
  action?: ReactNode;
  timestamp?: string | null;
  className?: string;
}) {
  return (
    <section
      aria-busy={state === "loading" ? true : undefined}
      aria-live="polite"
      className={`rounded-xl border p-5 ${TONE_CLASSES[state]} ${className}`}
      role="status"
    >
      <p className="text-sm font-medium text-foreground">
        {title ?? SURFACE_STATE_LABELS[state]}
      </p>
      <div className="mt-1 text-xs leading-5">{description}</div>
      {timestamp ? (
        <p className="mt-2 text-[11px] opacity-80">Last checked: {timestamp}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}
