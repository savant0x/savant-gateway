/**
 * Surface-state vocabulary (FID-2026-1103-134). Kept pure so the copy can be
 * tested without a DOM; the visual panel lives in `components/ui/state-panel`.
 */

export type SurfaceState = "empty" | "disabled" | "unavailable" | "loading";

export const SURFACE_STATE_LABELS: Record<SurfaceState, string> = {
  empty: "No data yet",
  disabled: "Not available",
  unavailable: "Temporarily unavailable",
  loading: "Loading",
};
