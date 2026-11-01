import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { IdentityRunRecord, IdentityVerdictRecord } from "./types.ts";

import { getModelForGateway } from "../storage/store/models.ts";

import {
  confirmMismatch,
  getRun,
  getVerdict,
  publishVerdict,
  requestCancel,
  unpublishVerdict,
} from "./store.ts";

/**
 * Lifecycle actions for `PATCH /api/admin/identity/runs/[id]` (FID-087).
 *
 * Publication is deliberately conservative: a completed run, a verdict, a model
 * the catalog still serves, and — for a consistency claim — an unexpired TTL.
 * A dated finding stays publishable because it is not a current-state claim.
 * `confirm_mismatch` writes the correction row but never publishes itself.
 */

export const IDENTITY_ACTIONS = [
  "start",
  "publish",
  "unpublish",
  "cancel",
  "confirm_mismatch",
] as const;

export type IdentityAction = (typeof IDENTITY_ACTIONS)[number];

const CONSISTENCY_STATES = new Set([
  "baseline",
  "self_consistent",
  "consistent",
]);

export type ActionOutcome =
  | {
      ok: true;
      status: 200 | 202;
      run: IdentityRunRecord;
      verdict: IdentityVerdictRecord | null;
      dispatch: boolean;
    }
  | { ok: false; status: number; error: string };

export function isIdentityAction(value: unknown): value is IdentityAction {
  return (
    typeof value === "string" &&
    (IDENTITY_ACTIONS as readonly string[]).includes(value)
  );
}

export async function actOnRun(
  db: PostgresDatabase,
  runId: string,
  action: IdentityAction,
  note: string,
  now = new Date().toISOString(),
): Promise<ActionOutcome> {
  const run = await getRun(db, runId);

  if (!run) return { ok: false, status: 404, error: "Unknown run." };

  const verdict = await getVerdict(db, runId);

  if (action === "start") {
    if (run.status !== "queued") {
      return { ok: false, status: 409, error: "Only a queued run can start." };
    }

    return {
      ok: true,
      status: 202,
      run,
      verdict,
      dispatch: true,
    };
  }

  if (action === "cancel") {
    if (run.status !== "queued" && run.status !== "running") {
      return {
        ok: false,
        status: 409,
        error: "Only a queued or running run can be cancelled.",
      };
    }

    await requestCancel(db, runId);

    return {
      ok: true,
      status: 200,
      run: (await getRun(db, runId)) ?? run,
      verdict,
      dispatch: false,
    };
  }

  if (action === "confirm_mismatch") {
    if (note.trim() === "") {
      return {
        ok: false,
        status: 400,
        error: "A note is required to confirm a mismatch.",
      };
    }

    if (verdict?.status !== "divergent_review") {
      return {
        ok: false,
        status: 409,
        error: "The verdict is not under review.",
      };
    }

    await confirmMismatch(db, runId, now, note.trim());

    return {
      ok: true,
      status: 200,
      run,
      verdict: await getVerdict(db, runId),
      dispatch: false,
    };
  }

  if (action === "unpublish") {
    if (note.trim() === "") {
      return {
        ok: false,
        status: 400,
        error: "A note is required to unpublish.",
      };
    }

    if (verdict?.published !== 1) {
      return { ok: false, status: 409, error: "The verdict is not published." };
    }

    await unpublishVerdict(db, runId, now, note.trim());

    return {
      ok: true,
      status: 200,
      run,
      verdict: await getVerdict(db, runId),
      dispatch: false,
    };
  }

  if (run.status !== "completed" || !verdict) {
    return {
      ok: false,
      status: 409,
      error: "Only a completed run with a verdict can be published.",
    };
  }

  const model = await getModelForGateway(db, verdict.targetModelId);

  if (!model || model.status !== "active" || !model.inCatalog) {
    return {
      ok: false,
      status: 409,
      error: "The model is no longer published.",
    };
  }

  if (CONSISTENCY_STATES.has(verdict.status) && verdict.validUntil <= now) {
    return {
      ok: false,
      status: 409,
      error: "The consistency result expired; run the check again.",
    };
  }

  if (
    verdict.status === "error" ||
    verdict.status === "unsupported" ||
    verdict.status === "stale"
  ) {
    return {
      ok: false,
      status: 409,
      error: "This verdict is not publishable.",
    };
  }

  await publishVerdict(
    db,
    runId,
    now,
    note.trim() === "" ? "Published by operator." : note.trim(),
  );

  return {
    ok: true,
    status: 200,
    run,
    verdict: await getVerdict(db, runId),
    dispatch: false,
  };
}
