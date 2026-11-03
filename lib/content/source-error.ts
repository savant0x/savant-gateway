/**
 * Failure classes for content sources (FID-2026-1103-120).
 *
 * A fetch failure is the upstream's problem and advances the auto-disable
 * streak. A configuration failure is the operator's input and must stay visible
 * without switching the source off, because the fix may be an out-of-band
 * credential or a URL correction the operator has not made yet.
 */

export type SourceFailureKind = "fetch" | "config";

export class SourceConfigError extends Error {
  readonly failureKind = "config" as const;

  constructor(message: string) {
    super(message);
    this.name = "SourceConfigError";
  }
}
