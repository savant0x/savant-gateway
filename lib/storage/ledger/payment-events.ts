import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Payment event state machine on the async handle (FID-2026-1031-086, step 4;
 * fenced by FID-2026-1105-010).
 *
 * A signed event is claimed once per generation. Claiming is not proof of
 * fulfillment: only a failed or stale claim may be reclaimed, and every
 * financial or entitlement effect runs while the event row is locked and its
 * generation is still current. A processed or quarantined event is terminal,
 * including against a later environment-mismatch delivery.
 */

export const CLAIM_GRACE_MS = 5 * 60 * 1000;

export type PaymentEventState =
  "claimed" | "processed" | "failed" | "quarantined";

export type ClaimOutcome =
  | { ok: true; attempt: number; generation: number }
  | {
      ok: false;
      reason:
        "processed" | "in_flight" | "quarantined" | "environment_mismatch";
    };

type EventRow = {
  status: PaymentEventState;
  attempts: number;
  claimed_at: string | null;
  claim_generation: number;
};

function stateReason(status: PaymentEventState) {
  if (status === "processed") return "processed" as const;
  if (status === "quarantined") return "quarantined" as const;

  return "in_flight" as const;
}

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
    const detail = `Event livemode ${String(input.livemode)} does not match the configured environment.`;
    const changed = await database
      .prepare(
        `INSERT INTO billing_events
          (id, type, processed_at, status, attempts, livemode, claimed_at,
           last_error, claim_generation)
         VALUES (?, ?, ?, 'quarantined', 1, ?, ?, ?, 1)
         ON CONFLICT (id) DO UPDATE SET
           status = 'quarantined',
           claimed_at = excluded.claimed_at,
           last_error = excluded.last_error,
           claim_generation = billing_events.claim_generation + 1
         WHERE billing_events.status NOT IN ('processed', 'quarantined')
         RETURNING id`,
      )
      .all<{ id: string }>(input.id, input.type, at, livemode, at, detail);

    if (changed.length > 0) {
      return { ok: false, reason: "environment_mismatch" };
    }

    const terminal = await database
      .prepare("SELECT status FROM billing_events WHERE id = ?")
      .get<{ status: PaymentEventState }>(input.id);

    return {
      ok: false,
      reason: terminal ? stateReason(terminal.status) : "quarantined",
    };
  }

  const grace = input.graceMs ?? CLAIM_GRACE_MS;
  const cutoff = new Date(input.now - grace).toISOString();
  const rows = await database
    .prepare(
      `INSERT INTO billing_events
        (id, type, processed_at, status, attempts, livemode, claimed_at,
         last_error, claim_generation)
       VALUES (?, ?, ?, 'claimed', 1, ?, ?, NULL, 1)
       ON CONFLICT (id) DO UPDATE SET
         status = 'claimed',
         attempts = billing_events.attempts + 1,
         claimed_at = excluded.claimed_at,
         last_error = NULL,
         claim_generation = billing_events.claim_generation + 1
       WHERE billing_events.status = 'failed'
          OR (billing_events.status = 'claimed'
              AND (billing_events.claimed_at IS NULL
                   OR billing_events.claimed_at::timestamptz <= ?::timestamptz))
       RETURNING attempts, claim_generation`,
    )
    .all<{ attempts: number; claim_generation: number }>(
      input.id,
      input.type,
      at,
      livemode,
      at,
      cutoff,
    );

  if (rows.length > 0) {
    return {
      ok: true,
      attempt: Number(rows[0].attempts),
      generation: Number(rows[0].claim_generation),
    };
  }

  const row = await database
    .prepare(
      "SELECT status, attempts, claimed_at, claim_generation FROM billing_events WHERE id = ?",
    )
    .get<EventRow>(input.id);

  return {
    ok: false,
    reason: row ? stateReason(row.status) : "in_flight",
  };
}

export async function completePaymentEvent(
  database: PostgresDatabase,
  id: string,
  generation: number,
  at: string,
) {
  const result = await database
    .prepare(
      `UPDATE billing_events
       SET status = 'processed', processed_at = ?, last_error = NULL
       WHERE id = ? AND status = 'claimed' AND claim_generation = ?`,
    )
    .run(at, id, generation);

  return result.changes > 0;
}

export async function failPaymentEvent(
  database: PostgresDatabase,
  id: string,
  generation: number,
  detail: string,
) {
  const result = await database
    .prepare(
      `UPDATE billing_events
       SET status = 'failed', last_error = ?
       WHERE id = ? AND status = 'claimed' AND claim_generation = ?`,
    )
    .run(detail.slice(0, 500), id, generation);

  return result.changes > 0;
}

export async function quarantinePaymentEvent(
  database: PostgresDatabase,
  id: string,
  generation: number,
  detail: string,
) {
  const result = await database
    .prepare(
      `UPDATE billing_events
       SET status = 'quarantined', last_error = ?
       WHERE id = ? AND status IN ('claimed', 'failed')
         AND claim_generation = ?`,
    )
    .run(detail.slice(0, 500), id, generation);

  return result.changes > 0;
}

export type PaymentEventWork<T> = {
  value: T;
  quarantine?: string | null;
};

export type PaymentEventResult<T> =
  | { ok: true; value: T; quarantined: boolean }
  | { ok: false; reason: "lost_ownership" };

/**
 * Runs every effect and the terminal transition under one event-row lock.
 *
 * The event lock is taken before the shared user/subscription/period order, so
 * a reclaimer cannot pass the generation fence while a financial write is in
 * flight. A caller that loses ownership gets no value and must not answer as if
 * it credited anyone.
 */
export async function processPaymentEvent<T>(
  database: PostgresDatabase,
  input: { id: string; generation: number; at?: string },
  work: () => Promise<PaymentEventWork<T>>,
): Promise<PaymentEventResult<T>> {
  return database
    .transaction(async () => {
      const row = await database
        .prepare(
          `SELECT status, claim_generation FROM billing_events
            WHERE id = ? FOR UPDATE`,
        )
        .get<{ status: PaymentEventState; claim_generation: number }>(input.id);

      if (
        !row ||
        row.status !== "claimed" ||
        Number(row.claim_generation) !== input.generation
      ) {
        return { ok: false, reason: "lost_ownership" } as const;
      }

      const result = await work();
      const at = input.at ?? new Date().toISOString();

      if (result.quarantine) {
        const changed = await quarantinePaymentEvent(
          database,
          input.id,
          input.generation,
          result.quarantine,
        );

        if (!changed) throw new Error("Payment event lost ownership.");

        return {
          ok: true,
          value: result.value,
          quarantined: true,
        } as const;
      }

      const changed = await completePaymentEvent(
        database,
        input.id,
        input.generation,
        at,
      );

      if (!changed) throw new Error("Payment event lost ownership.");

      return {
        ok: true,
        value: result.value,
        quarantined: false,
      } as const;
    })
    .immediate();
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
