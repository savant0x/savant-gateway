import { check, checkEqual, request } from "./harness.mjs";

function accounting(db, userId) {
  return {
    ...db.prepare(
      "SELECT credit_micros, held_micros FROM users WHERE id = ?",
    ).get(userId),
    usage: db.prepare(
      "SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ?",
    ).get(userId).n,
    ledger: db.prepare(
      "SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id = ?",
    ).get(userId).n,
  };
}

async function streamCall(context, alpha, cancel = false) {
  let text = "";

  try {
    const response = await fetch(`${context.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alpha.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "mock-paid",
        messages: [{ role: "user", content: cancel ? "cancel probe" : "stream probe" }],
        max_tokens: 64,
        stream: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      text += decoder.decode(value, { stream: true });

      if (cancel && text.includes("http-suite-stream")) {
        await reader.cancel();

        return { completed: false, text };
      }
    }

    return { completed: response.ok, text };
  } catch {
    return { completed: false, text };
  }
}

export async function runSystemsChecks(context, alpha, adminCookie) {
  const before = accounting(context.db, alpha.id);
  const providerCalls = context.mock.state.calls;
  const observations = [];

  for (const body of [null, [], "value", 42, true]) {
    const completion = await request(context.baseUrl, "/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${alpha.secret}` },
      body,
    });
    const benchmark = await request(context.baseUrl, "/api/admin/benchmarks", {
      method: "POST",
      cookie: `sg_admin=${adminCookie}`,
      body,
    });

    observations.push({ root: JSON.stringify(body), completion, benchmark });
  }

  console.log(`systems-http: root statuses ${JSON.stringify(observations.map(
    ({ root, completion, benchmark }) => ({
      root, completion: completion.status, benchmark: benchmark.status,
    }),
  ))}`);
  checkEqual("invalid roots never dispatch upstream", context.mock.state.calls, providerCalls);
  checkEqual("invalid roots leave accounting untouched",
    JSON.stringify(accounting(context.db, alpha.id)), JSON.stringify(before));

  const success = await streamCall(context, alpha);

  check("normal paid SSE completes", success.completed && success.text.includes("[DONE]"));
  check("split UTF-8 SSE content survives relay", success.text.includes("💠"));
  const settled = accounting(context.db, alpha.id);

  checkEqual("paid SSE debits exact unequal rates", settled.credit_micros, before.credit_micros - 200);
  checkEqual("paid SSE releases held credit", settled.held_micros, 0);
  checkEqual("paid SSE records one usage", settled.usage, before.usage + 1);
  checkEqual("paid SSE records one debit", settled.ledger, before.ledger + 1);

  context.db.exec(`CREATE TRIGGER reject_systems_usage BEFORE INSERT ON usage_events
    BEGIN SELECT RAISE(ABORT, 'injected-write-failure-private-detail'); END`);
  let failed;
  let after;

  try {
    failed = await streamCall(context, alpha);
    after = accounting(context.db, alpha.id);
  } finally {
    context.db.exec("DROP TRIGGER reject_systems_usage");
  }

  console.log(`systems-http: failed settlement completed=${failed.completed}, hold=${after.held_micros}, usageDelta=${after.usage - settled.usage}`);
  checkEqual("failed settlement rolls back the debit", after.credit_micros, settled.credit_micros);
  checkEqual("failed settlement rolls back usage", after.usage, settled.usage);
  checkEqual("failed settlement rolls back ledger", after.ledger, settled.ledger);
  check("failed settlement retains its reservation", after.held_micros > 0);

  // Keep the failed reservation for reconciliation: a later successful request
  // must settle only its own hold, rather than hiding or refunding this one.
  const recovered = await streamCall(context, alpha);
  const later = accounting(context.db, alpha.id);

  check("a later paid stream succeeds after storage recovers", recovered.completed);
  checkEqual("later request debits only once", later.credit_micros, settled.credit_micros - 200);
  checkEqual("unresolved reservation remains visible", later.held_micros, after.held_micros);

  for (const { root, completion, benchmark } of observations) {
    checkEqual(`completion rejects ${root} root`, completion.status, 400);
    checkEqual(`completion ${root} uses public error shape`, completion.json?.error?.type, "invalid_request_error");
    checkEqual(`benchmark refresh rejects ${root} root`, benchmark.status, 400);
  }

  check("failed settlement cannot complete normally", !failed.completed);
  check("failed settlement never acknowledges DONE", !failed.text.includes("[DONE]"));
  check("failed settlement emits an operator diagnostic", context.logs.err.includes("[gateway.settlement]"));
  check("settlement diagnostic excludes exception details", !context.logs.err.includes("injected-write-failure-private-detail"));

  await streamCall(context, alpha, true);
  let cancelled;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    cancelled = context.db.prepare(
      "SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ? AND status = 'cancelled'",
    ).get(alpha.id).n;

    if (cancelled === 1) break;

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const afterCancel = accounting(context.db, alpha.id);

  checkEqual("client disconnect records one cancelled usage", cancelled, 1);
  checkEqual("client disconnect settles once", afterCancel.usage, later.usage + 1);
  checkEqual("client disconnect records one ledger debit", afterCancel.ledger, later.ledger + 1);
  checkEqual("client disconnect releases only its own hold", afterCancel.held_micros, later.held_micros);
}
