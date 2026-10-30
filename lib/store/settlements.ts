import "server-only";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import {
  listQuarantinedHolds,
  listSettlements,
  openSettlement,
  releaseQuarantinedHold,
  type SettlementBillingSource,
} from "../settlement-ledger";

/** Records an admitted call before dispatch. Throws if it cannot be stored. */
export function openCallSettlement(input: {
  userId: string;
  keyId: string;
  modelId: string;
  providerSlug: string;
  billingSource: SettlementBillingSource;
  creditHoldId: string | null;
  freeReservationId: string | null;
  subscriptionHoldId: string | null;
  estimatedMicros: number;
}) {
  return openSettlement(db, { id: `stl_${randomUUID()}`, ...input }, nowIso());
}

export function listSettlementState(limit = 50) {
  return {
    settlements: listSettlements(db, limit),
    quarantined: listQuarantinedHolds(db, limit),
  };
}

export function releaseQuarantined(id: string, note?: string | null) {
  return releaseQuarantinedHold(db, {
    id,
    releasedAt: nowIso(),
    note: note ?? "Operator release",
  });
}
