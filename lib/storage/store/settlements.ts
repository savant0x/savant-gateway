import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import {
  listQuarantinedHolds,
  listSettlements,
  openSettlement,
  releaseQuarantinedHold,
  type SettlementBillingSource,
} from "../ledger/settlements.ts";

/**
 * Settlement store, ported to the async handle (FID-085 step 4).
 *
 * The store is a thin identity supplier: the ledger owns the statements, and
 * this module supplies the call id and the clock. It maps exactly onto the
 * four operations the gateway and the operator console use — record an admitted
 * call, read state, release a quarantined hold — so there is one place a call
 * id can be minted.
 *
 * Recording an admitted call throws when it cannot be stored. That is
 * deliberate and unchanged: admitting a call whose settlement row did not
 * commit would be a charge with no audit trail.
 */

export async function openCallSettlement(
  db: PostgresDatabase,
  input: {
    userId: string;
    keyId: string;
    modelId: string;
    providerSlug: string;
    billingSource: SettlementBillingSource;
    creditHoldId: string | null;
    freeReservationId: string | null;
    subscriptionHoldId: string | null;
    estimatedMicros: number;
  },
  now = new Date().toISOString(),
) {
  return openSettlement(db, { id: `stl_${randomUUID()}`, ...input }, now);
}

export async function listSettlementState(db: PostgresDatabase, limit = 50) {
  return {
    settlements: await listSettlements(db, limit),
    quarantined: await listQuarantinedHolds(db, limit),
  };
}

export async function releaseQuarantined(
  db: PostgresDatabase,
  id: string,
  note?: string | null,
  now = new Date().toISOString(),
) {
  return releaseQuarantinedHold(db, {
    id,
    releasedAt: now,
    note: note ?? "Operator release",
  });
}
