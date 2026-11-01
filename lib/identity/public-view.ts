import type { IdentityPublishedView, IdentityVerdictRecord } from "./types.ts";

import { DECISION } from "./battery.ts";
import { publishedView, verdictSummary } from "./view.ts";

/**
 * Publication TTL (FID-087).
 *
 * A consistency result ages out; a dated finding does not. `mismatch_confirmed`
 * and `divergent_review` are statements about a past test, so rewriting them to
 * "stale" would erase a finding the operator published on purpose. Only the
 * consistency states (`baseline`, `self_consistent`, `consistent`) carry a
 * current-state claim and therefore expire.
 */
const CONSISTENCY_STATES = new Set([
  "baseline",
  "self_consistent",
  "consistent",
]);

export function applyPublicationTtl(
  verdict: IdentityVerdictRecord,
  now: string,
): IdentityVerdictRecord {
  if (!CONSISTENCY_STATES.has(verdict.status)) return verdict;
  if (verdict.validUntil > now) return verdict;

  return {
    ...verdict,
    status: "stale",
    summary: verdictSummary("stale", { days: DECISION.ttlDays }),
    claimsJson: "[]",
  };
}

export function publicIdentityView(
  verdict: IdentityVerdictRecord,
  findings: Parameters<typeof publishedView>[0]["findings"],
  protocolId: string,
  now: string,
): IdentityPublishedView {
  return publishedView({
    verdict: applyPublicationTtl(verdict, now),
    findings,
    protocolId,
  });
}
