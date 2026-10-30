import type { DatabaseHandle } from "./schema/columns.ts";

/**
 * Payment event state machine.
 *
 * A signed event is claimed once. Claiming is not proof of fulfillment: the
 * claim carries a timestamp, attempt count and mode, and a claim older than the
 * grace window (or one recorded as failed) can be retried. A processed or
 * quarantined event is terminal, so a duplicate delivery cannot credit twice
 * and a mismatched delivery cannot credit at all.
 */

export const CLAIM_GRACE_MS = 5 * 60 * 1000;

export type PaymentEventState =
  "claimed" | "processed" | "failed" | "quarantined";

export type ClaimOutcome =
  | { ok: true; attempt: number }
  | {
      ok: false;
      reason:
        "processed" | "in_flight" | "quarantined" | "environment_mismatch";
    };

type EventRow = {
  status: PaymentEventState;
  attempts: number;
  claimed_at: string | null;
};

export function claimPaymentEvent(
  database: DatabaseHandle,
  input: {
    id: string;
    type: string;
    livemode: boolean | null;
    expectedLivemode: boolean | null;
    now: number;
    graceMs?: number;
  },
): ClaimOutcome {
  const at = new Date(input.now).toISOString();
  const livemode = input.livemode === null ? null : input.livemode ? 1 : 0;

  // The mode check runs before any claim, so a fixture or test-mode delivery
  // can never become a live claim that a later retry completes.
  if (
    input.expectedLivemode !== null &&
    input.livemode !== null &&
    input.livemode !== input.expectedLivemode
  ) {
    database
      .prepare(
        `INSERT INTO billing_events
          (id, type, processed_at, status, attempts, livemode, claimed_at,
           last_error)
         VALUES (?, ?, ?, 'quarantined', 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = 'quarantined', last_error = excluded.last_error`,
      )
      .run(
        input.id,
        input.type,
        at,
        livemode,
        at,
        `Event livemode ${String(input.livemode)} does not match the configured environment.`,
      );

    return { ok: false, reason: "environment_mismatch" };
  }

  const row = database
    .prepare(
      "SELECT status, attempts, claimed_at FROM billing_events WHERE id = ?",
    )
    .get(input.id) as EventRow | undefined;

  if (!row) {
    database
      .prepare(
        `INSERT INTO billing_events
          (id, type, processed_at, status, attempts, livemode, claimed_at)
         VALUES (?, ?, ?, 'claimed', 1, ?, ?)`,
      )
      .run(input.id, input.type, at, livemode, at);

    return { ok: true, attempt: 1 };
  }

  if (row.status === "processed") return { ok: false, reason: "processed" };
  if (row.status === "quarantined") return { ok: false, reason: "quarantined" };

  const claimedAt = row.claimed_at ? Date.parse(row.claimed_at) : Number.NaN;
  const grace = input.graceMs ?? CLAIM_GRACE_MS;
  const stale = !Number.isFinite(claimedAt) || input.now - claimedAt >= grace;

  if (row.status === "claimed" && !stale) {
    return { ok: false, reason: "in_flight" };
  }

  database
    .prepare(
      `UPDATE billing_events
       SET status = 'claimed', attempts = attempts + 1, claimed_at = ?,
           last_error = NULL
       WHERE id = ?`,
    )
    .run(at, input.id);

  return { ok: true, attempt: row.attempts + 1 };
}

export function completePaymentEvent(
  database: DatabaseHandle,
  id: string,
  at: string,
) {
  database
    .prepare(
      `UPDATE billing_events
       SET status = 'processed', processed_at = ?, last_error = NULL
       WHERE id = ? AND status = 'claimed'`,
    )
    .run(at, id);
}

export function failPaymentEvent(
  database: DatabaseHandle,
  id: string,
  detail: string,
) {
  database
    .prepare(
      `UPDATE billing_events
       SET status = 'failed', last_error = ?
       WHERE id = ? AND status = 'claimed'`,
    )
    .run(detail.slice(0, 500), id);
}

export function quarantinePaymentEvent(
  database: DatabaseHandle,
  id: string,
  detail: string,
) {
  database
    .prepare(
      `UPDATE billing_events
       SET status = 'quarantined', last_error = ?
       WHERE id = ? AND status IN ('claimed', 'failed')`,
    )
    .run(detail.slice(0, 500), id);
}

export function listPaymentEvents(database: DatabaseHandle, limit = 50) {
  return database
    .prepare(
      `SELECT id, type, status, attempts, livemode, claimed_at, processed_at,
              last_error
       FROM billing_events
       ORDER BY datetime(processed_at) DESC
       LIMIT ?`,
    )
    .all(limit);
}
