import { waitFor } from "./client.mjs";
import { summarize } from "./metrics.mjs";

export function counts(database) {
  const settlement = database
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'admitted' THEN 1 ELSE 0 END) AS admitted,
         SUM(CASE WHEN status = 'committed' THEN 1 ELSE 0 END) AS committed,
         SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) AS quarantined
       FROM settlements`,
    )
    .get();
  const usage = database
    .prepare("SELECT COUNT(*) AS total FROM usage_events")
    .get();
  const holds = database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds")
    .get();

  return {
    usage: Number(usage.total),
    admitted: Number(settlement.admitted ?? 0),
    committed: Number(settlement.committed ?? 0),
    quarantined: Number(settlement.quarantined ?? 0),
    holds: Number(holds.total),
  };
}

export async function runPool(count, concurrency, task) {
  const results = new Array(count);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), count) },
    async () => {
      while (true) {
        const index = next;
        next += 1;

        if (index >= count) return;

        try {
          results[index] = await task(index);
        } catch (error) {
          results[index] = {
            status: 0,
            latencyMs: 0,
            text: "",
            json: null,
            transportError: error instanceof Error ? error.message : String(error),
          };
        }
      }
    },
  );

  await Promise.all(workers);

  return results;
}

/**
 * Runs one bounded offered workload and reconciles it independently of what
 * the client thought happened: dispatch comes from the fixture upstream, and
 * settlement/usage come from SQLite. A run cannot pass by refusing work or by
 * accepting it without a final ledger outcome.
 */
export async function runOffered(context, input) {
  const { database, mock } = context;
  const before = counts(database);
  const mockBefore = mock.state.calls;
  const startedAt = performance.now();
  const observations = await runPool(input.count, input.concurrency, input.task);
  const wallMs = performance.now() - startedAt;
  const dispatched = mock.state.calls - mockBefore;
  const settled = dispatched
    ? await waitFor(
        () => {
          const current = counts(database);

          return (
            current.usage - before.usage >= dispatched &&
            current.committed + current.quarantined - before.committed -
              before.quarantined >=
              dispatched
          );
        },
        { timeoutMs: input.settleTimeoutMs ?? 10_000 },
      )
    : true;
  const after = counts(database);
  const summary = summarize(input.label, observations, {
    expectedStatuses: input.expectedStatuses,
    allowTransportError: input.allowTransportError,
  });

  return {
    ...summary,
    dispatched,
    refused: observations.length - dispatched,
    admittedBps:
      observations.length === 0
        ? 0
        : Math.round((dispatched * 10_000) / observations.length),
    usageDelta: after.usage - before.usage,
    settlementDelta:
      after.committed +
      after.quarantined -
      before.committed -
      before.quarantined,
    unresolvedDelta: after.admitted - before.admitted,
    holdDelta: after.holds - before.holds,
    settled: Boolean(settled),
    wallMs: Math.round(wallMs),
    rps:
      wallMs > 0 ? Math.round((dispatched / (wallMs / 1000)) * 100) / 100 : 0,
    observations,
  };
}
