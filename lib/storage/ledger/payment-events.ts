import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Payment event state machine on the async handle (FID-2026-1031-086, step 4).
 *
 * The rules are the same as `lib/payment-events.ts`, which remains the SQLite
 * test fixture until the suite port lands. A signed event is claimed once;
 * claiming is not proof of fulfillment, and only a failed or stale claim may be
 * retried. A processed or quarantined event is terminal.
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

export async function claimPaymentEvent(
  database: PostgresDatabase,
  input: {
    id: string;
    type: string;
    livemode: boolean | null;
    expectedLivemode: boolean | null;
    now: number;
    graceMs?: number;
  },
): Promise<ClaimOutcome> {
  const at = new Date(input.now).toISOString();
  const livemode = input.livemode === null ? null : input.livemode ? 1 : 0;

  if (
    input.expectedLivemode !== null &&
    input.livemode !== null &&
    input.livemode !== input.expectedLivemode
  ) {
    await database
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

  const row = await database
    .prepare(
      "SELECT status, attempts, claimed_at FROM billing_events WHERE id = ?",
    )
    .get<EventRow>(input.id);

  if (!row) {
    await database
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

  await database
    .prepare(
      `UPDATE billing_events
       SET status = 'claimed', attempts = attempts + 1, claimed_at = ?,
           last_error = NULL
       WHERE id = ?`,
    )
    .run(at, input.id);

  return { ok: true, attempt: row.attempts + 1 };
}

export async function completePaymentEvent(
  database: PostgresDatabase,
  id: string,
  at: string,
) {
  await database
    .prepare(
      `UPDATE billing_events
       SET status = 'processed', processed_at = ?, last_error = NULL
       WHERE id = ? AND status = 'claimed'`,
    )
    .run(at, id);
}

export async function failPaymentEvent(
  database: PostgresDatabase,
  id: string,
  detail: string,
) {
  await database
    .prepare(
      `UPDATE billing_events
       SET status = 'failed', last_error = ?
       WHERE id = ? AND status = 'claimed'`,
    )
    .run(detail.slice(0, 500), id);
}

export async function quarantinePaymentEvent(
  database: PostgresDatabase,
  id: string,
  detail: string,
) {
  await database
    .prepare(
      `UPDATE billing_events
       SET status = 'quarantined', last_error = ?
       WHERE id = ? AND status IN ('claimed', 'failed')`,
    )
    .run(detail.slice(0, 500), id);
}

export async function listPaymentEvents(
  database: PostgresDatabase,
  limit = 50,
) {
  return database
    .prepare(
      `SELECT id, type, status, attempts, livemode, claimed_at, processed_at,
              last_error
       FROM billing_events
       ORDER BY processed_at::timestamptz DESC
       LIMIT ?`,
    )
    .all(limit);
}
