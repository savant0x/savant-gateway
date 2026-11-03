import { jsonCall, openStream } from "./client.mjs";
import { runOffered } from "./offered.mjs";

const PAID = "load-paid";
const FREE = "load-free";

function withoutObservations(result) {
  const { observations, ...rest } = result;

  return rest;
}

function countStatuses(observations) {
  const counts = {};

  for (const row of observations) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return counts;
}

function providerRefusals(result) {
  return result.observations
    .filter((row) => row.status === 429)
    .map((row) => row.headers.get("x-ratelimit-scope"))
    .filter(Boolean);
}

function paidTask(context, content, maxTokens = 64) {
  return () =>
    jsonCall(context.baseUrl, context.fixture.paid.secret, {
      model: PAID,
      content,
      maxTokens,
    });
}

export async function runRamp(context) {
  const { envelope } = context;
  const ramp = [];
  const providerConcurrency = envelope.environment.providerConcurrency;

  for (const level of envelope.workloads.ramp.levels) {
    const result = await runOffered(context, {
      label: `ramp-${level}`,
      count: envelope.workloads.ramp.requestsPerLevel,
      concurrency: level,
      expectedStatuses: level > providerConcurrency ? [200, 429] : [200],
      task: paidTask(context, "ramp probe"),
    });
    const scopes = providerRefusals(result);
    const saturation = level > providerConcurrency;

    ramp.push({
      ...withoutObservations(result),
      level,
      saturation,
      providerRefusalScopes: [...new Set(scopes)],
      honestSaturation:
        !saturation ||
        (result.dispatched >= providerConcurrency &&
          scopes.length > 0 &&
          scopes.every((scope) => scope === "provider")),
    });
  }

  return ramp;
}

export async function runSteady(context) {
  const workload = context.envelope.workloads.steady;
  const result = await runOffered(context, {
    label: "steady",
    count: workload.requests,
    concurrency: workload.concurrency,
    expectedStatuses: [200],
    task: paidTask(context, "steady probe"),
  });

  return withoutObservations(result);
}

export async function runBurst(context) {
  const workload = context.envelope.workloads.burst;
  const result = await runOffered(context, {
    label: "burst",
    count: workload.requests,
    concurrency: workload.concurrency,
    expectedStatuses: [200, 429],
    task: paidTask(context, "burst probe"),
  });
  const scopes = providerRefusals(result);

  return {
    ...withoutObservations(result),
    statuses: countStatuses(result.observations),
    providerRefusalScopes: [...new Set(scopes)],
    honestShedding:
      result.dispatched >= context.envelope.environment.providerConcurrency &&
      scopes.length > 0 &&
      scopes.every((scope) => scope === "provider"),
  };
}

export async function runStreams(context) {
  const workload = context.envelope.workloads.streams;
  const { mock } = context;

  mock.state.inference.streamFrames = workload.frames;
  mock.state.inference.streamFrameDelayMs = workload.frameDelayMs;
  mock.state.inference.truncatedStream = false;

  try {
    const long = await runOffered(context, {
      label: "streams-long",
      count: workload.long,
      concurrency: workload.concurrency,
      expectedStatuses: [200],
      task: async () => {
        const stream = openStream(
          context.baseUrl,
          context.fixture.paid.secret,
          { model: PAID, content: "long stream probe", maxTokens: 64 },
        );

        await stream.started;

        return stream.done;
      },
    });
    const cancelled = await runOffered(context, {
      label: "streams-cancelled",
      count: workload.cancelled,
      concurrency: 4,
      expectedStatuses: [200],
      task: async () => {
        const stream = openStream(
          context.baseUrl,
          context.fixture.paid.secret,
          {
            model: PAID,
            content: "cancel load probe",
            maxTokens: 64,
            cancelAfterBytes: 20,
          },
        );

        await stream.started;

        return stream.done;
      },
    });
    const cancelledUsage = await context.database
      .prepare(
        `SELECT COUNT(*) AS total FROM usage_events
         WHERE user_id = ? AND status = 'cancelled'`,
      )
      .get(context.fixture.paid.userId);

    return {
      long: {
        ...withoutObservations(long),
        allCompleted: long.observations.every(
          (row) => row.status === 200 && row.completed,
        ),
      },
      cancelled: {
        ...withoutObservations(cancelled),
        allCancelled: cancelled.observations.every(
          (row) => row.status === 200 && row.cancelled,
        ),
        cancelledUsage: Number(cancelledUsage?.total ?? 0),
      },
    };
  } finally {
    mock.state.inference.streamFrames = null;
    mock.state.inference.streamFrameDelayMs = 5;
  }
}

export async function runMixedBilling(context) {
  const workload = context.envelope.workloads.mixedBilling;
  const before = await context.database
    .prepare(
      `SELECT billing_source, COUNT(*) AS total
       FROM usage_events GROUP BY billing_source`,
    )
    .all();
  const result = await runOffered(context, {
    label: "mixed-billing",
    count: workload.free + workload.paid,
    concurrency: workload.concurrency,
    expectedStatuses: [200],
    task: (index) =>
      index < workload.free
        ? jsonCall(context.baseUrl, context.fixture.free.secret, {
            model: FREE,
            content: "mixed free probe",
            maxTokens: 8,
          })
        : jsonCall(context.baseUrl, context.fixture.paid.secret, {
            model: PAID,
            content: "mixed paid probe",
            maxTokens: 64,
          }),
  });
  const after = await context.database
    .prepare(
      `SELECT billing_source, COUNT(*) AS total
       FROM usage_events GROUP BY billing_source`,
    )
    .all();
  const totals = new Map(
    after.map((row) => [row.billing_source, Number(row.total)]),
  );
  const previous = new Map(
    before.map((row) => [row.billing_source, Number(row.total)]),
  );
  const charged = await context.database
    .prepare(
      `SELECT COALESCE(SUM(charged_micros), 0) AS total FROM usage_events
       WHERE user_id = ?`,
    )
    .get(context.fixture.free.userId);

  return {
    ...withoutObservations(result),
    billingSources: {
      free: (totals.get("free") ?? 0) - (previous.get("free") ?? 0),
      credit: (totals.get("credit") ?? 0) - (previous.get("credit") ?? 0),
    },
    freeChargedMicros: Number(charged?.total ?? 0),
  };
}

export async function runReservations(context) {
  const workload = context.envelope.workloads.reservations;
  const userId = context.fixture.reserved.userId;
  // This workload measures competing credit reservations, not provider
  // saturation (the burst workload owns that). Offering more concurrent calls
  // than the provider gate admits lets provider 429s mask the 402s the check
  // is about, so clamp to the serving ceiling.
  const concurrency = Math.min(
    workload.concurrency,
    context.envelope.environment.providerConcurrency,
  );
  const result = await runOffered(context, {
    label: "competing-reservations",
    count: workload.requests,
    concurrency,
    expectedStatuses: [200, 402],
    task: () =>
      jsonCall(context.baseUrl, context.fixture.reserved.secret, {
        model: PAID,
        // The prompt estimate must cover the fixture's reported 100 input
        // tokens; otherwise the documented actual-over-estimate overrun, not
        // competing reservations, is what the probe measures.
        content: "reservation probe ".repeat(22),
        maxTokens: workload.maxTokens,
      }),
  });
  const account = await context.database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const holds = await context.database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE user_id = ?")
    .get(userId);

  return {
    ...withoutObservations(result),
    concurrency,
    statuses: countStatuses(result.observations),
    account: {
      credit_micros: Number(account?.credit_micros ?? 0),
      held_micros: Number(account?.held_micros ?? 0),
    },
    activeHolds: Number(holds?.total ?? 0),
    noOverAdmission: result.dispatched <= 2,
    noOverdraft:
      Number(account?.credit_micros ?? 0) >= 0 &&
      Number(account?.held_micros ?? 0) === 0,
  };
}

export async function runKeyChurn(context) {
  const workload = context.envelope.workloads.keyChurn;
  const cookie = context.fixture.keyChurn.cookie;
  const attempts = await Promise.all(
    Array.from({ length: workload.attempts }, async (_, index) => {
      const response = await fetch(`${context.baseUrl}/api/account/keys`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: context.baseUrl,
        },
        body: JSON.stringify({ name: `churn ${index}` }),
      });
      const text = await response.text();
      let json = null;

      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      return { status: response.status, json };
    }),
  );
  const created = attempts.filter((row) => row.status === 201);
  const revoked = await Promise.all(
    created.map(async (row) => {
      const response = await fetch(
        `${context.baseUrl}/api/account/keys/${row.json.key.id}`,
        { method: "DELETE", headers: { cookie, origin: context.baseUrl } },
      );

      return response.status;
    }),
  );
  const active = await context.database
    .prepare(
      "SELECT COUNT(*) AS total FROM api_keys WHERE user_id = ? AND status = 'active'",
    )
    .get(context.fixture.keyChurn.userId);

  return {
    label: "key-churn",
    offered: workload.attempts,
    created: created.length,
    refused: attempts.filter((row) => row.status === 429).length,
    unexpected: attempts.filter(
      (row) => row.status !== 201 && row.status !== 429,
    ).length,
    revoked: revoked.filter((status) => status === 200).length,
    activeAfterRevoke: Number(active?.total ?? 0),
  };
}

export async function runAllWorkloads(context) {
  const ramp = await runRamp(context);
  const steady = await runSteady(context);
  const burst = await runBurst(context);
  const streams = await runStreams(context);
  const mixedBilling = await runMixedBilling(context);
  const reservations = await runReservations(context);
  const keyChurn = await runKeyChurn(context);

  return { ramp, steady, burst, streams, mixedBilling, reservations, keyChurn };
}
