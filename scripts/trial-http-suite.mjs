import { createServer } from "node:http";

import {
  check, checkEqual, checkProviderDouble, logTail, request, reservePort,
  startNextServer, stopNextServer, waitForServer, cookieValue,
} from "./http-suite/harness.mjs";
import {
  openDatabase,
  startDatabaseServer,
  waitForSchema,
} from "./http-suite/db.mjs";
import { seedCatalog } from "./http-suite/seed.mjs";

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
let calls = 0;
let serving = "";
let fail = false;
let quotaFails = false;
let remaining = 20_000_000;
const mock = createServer((req, res) => {
  if (req.url === "/subscription") {
    res.writeHead(quotaFails ? 502 : 200, { "content-type": "application/json" });
    const tomorrow = new Date();

    tomorrow.setUTCHours(24, 0, 0, 0);
    res.end(JSON.stringify(quotaFails ? { error: "quota unavailable" } : {
      mode: "free", allowed: true, unlimited: false, token_limit: 20_000_000,
      tokens_used: 20_000_000 - remaining, tokens_remaining: remaining,
      resets_at_utc: tomorrow.toISOString(),
    }));
    return;
  }

  // The fixture provider is seeded with balance support, so the gateway reads
  // this endpoint when its observation expires. Answering it here is what keeps
  // the double honest about the capability it advertises.
  if (req.url === "/balance") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ balance_usd: 0, rpm: 9000, rpm_plan: "free" }));
    return;
  }

  let body = "";

  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let parsed;

    // A malformed body is a named 400, not a crash that hides the real failure.
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "mock expects a JSON completion body" }));
      return;
    }

    calls++;
    serving = parsed.model;
    if (fail) { res.writeHead(500); res.end("mock failure"); return; }
    const data = {
      model: parsed.model,
      choices: [{ message: { role: "assistant", content: "trial-ok" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };

    res.setHeader("Content-Type", parsed.stream ? "text/event-stream" : "application/json");
    res.end(parsed.stream ? `data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n` : JSON.stringify(data));
  });
});

await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const upstreamUrl = `http://127.0.0.1:${mock.address().port}`;
let db = null;
let server = null;
let databaseServer = null;

try {
  // The concurrent trial check needs real transaction semantics. Use the
  // configured endpoint or start a disposable container; never the PGlite wire.
  databaseServer = await startDatabaseServer({
    connectionString:
      process.env.HTTP_TEST_DATABASE_URL?.trim() ||
      process.env.TEST_DATABASE_URL?.trim(),
    requireReal: true,
  });
  server = startNextServer({
    repo: process.cwd(), port,
    databaseUrl: databaseServer.connectionString,
    env: {
      PROVIDER_SHARED_RPM: "9000",
      // Pin the free admission bucket: this suite proves trial reservation, not
      // the global free RPM guard, and `next start` also loads `.env.local`.
      FREE_SHARED_RPM: "9000",
      TRIAL_ENABLED: "true", TRIAL_WEIGHTED_TOKENS: "300",
      TRIAL_GATEWAY_GRANT_BUDGET: "10000",
      TRIAL_MODEL_PAIRS: '{"free/mock":"mock-paid"}',
      HTTP_SUITE_PROVIDER_KEY: "trial-test-key",
      PROVIDER_KEY: "", COMMANDCODE_API_KEY: "",
      // Disposable production start against a throwaway database: the validator
      // requires the explicit opt-in plus the admin configuration it still checks.
      GATEWAY_DISPOSABLE_START: "yes",
      ADMIN_PASSWORD: "trial-suite-admin-password",
      ADMIN_SESSION_SECRET: "trial-suite-admin-secret-0123456789abcdef",
      STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "",
      EMAIL_TRANSPORT: "", RESEND_API_KEY: "", EMAIL_FROM: "",
    },
  });
  await waitForServer({ baseUrl, ...server });
  db = await openDatabase(databaseServer.connectionString);
  await waitForSchema(db);
  await seedCatalog(db, { mockBaseUrl: upstreamUrl });
  checkEqual("unconfigured account email refuses sending", (await request(baseUrl, "/api/auth/email/request", {
    method: "POST", body: { purpose: "reset", email: "absent@example.test" },
  })).status, 503);
  checkEqual("unconfigured email issues no action token", (await db.prepare("SELECT COUNT(*)::int AS n FROM account_actions").get()).n, 0);
  checkEqual("recovery page discloses disabled delivery", (await request(baseUrl, "/recover")).text.includes("Password recovery is unavailable"), true);
  await db.prepare(`INSERT INTO models
    (id, upstream_id, name, provider, context_window, token_weight, allow_free,
     status, synced_at, upstream_slug, family, protocol, cost_source, in_catalog,
     group_slug, group_source)
    VALUES ('free/mock', 'free/mock-upstream', 'Trial Mock', 'Mock', '128000',
      2, 1, 'active', ?, 'mock', 'Mock', 'chat', 'synced', 1, 'free', 'manual')`)
    .run(new Date().toISOString());
  const refresh = async () => {
    remaining = 20_000_000;
    quotaFails = false;
    await db.prepare("UPDATE providers SET supports_subscription = 1 WHERE slug = 'mock'").run();
  };

  await refresh();
  // `refresh` is what turns subscription support on, so the probe runs after
  // it to cover both advertised endpoints of this double.
  await checkProviderDouble({ db, slug: "mock", upstreamUrl, apiKey: "trial-test-key" });

  async function customer(email) {
    const signup = await request(baseUrl, "/api/auth/signup", {
      method: "POST",
      body: {
        name: "Trial Test",
        email,
        password: "trial-test-password",
        acceptedPolicies: true,
      },
    });

    checkEqual("trial signup", signup.status, 201);
    const cookie = `sg_session=${cookieValue(signup, "sg_session")}`;
    const userId = signup.json.customer.id;

    await db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(new Date().toISOString(), userId);
    const key = await request(baseUrl, "/api/account/keys", {
      method: "POST", cookie, body: { name: "Trial key" },
    });

    return { userId, cookie, secret: key.json.secret };
  }

  const customerA = await customer("trial-a@example.test");
  const chat = (customer, extra = {}) => request(baseUrl, "/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${customer.secret}` },
    body: { model: "free/mock", messages: [{ role: "user", content: "Hello" }], max_tokens: 20, ...extra },
  });
  const first = await chat(customerA);

  checkEqual("trial call succeeds", first.status, 200);
  checkEqual("trial uses free upstream", serving, "free/mock-upstream");
  checkEqual("trial settles actual weighted usage", (await db.prepare("SELECT used_tokens::int AS used_tokens FROM trial_grants WHERE user_id = ?").get(customerA.userId)).used_tokens, 300);
  // FID-150: the free SKU refresh route must serve the lifetime snapshot in
  // trial mode. `/api/account/trial` cannot: it is daily-only and returns 503
  // when the trial is enabled.
  const lifetimeAllocation = await request(baseUrl, "/api/account/allocation", {
    cookie: customerA.cookie,
  });

  checkEqual("lifetime allocation read returns 200", lifetimeAllocation.status, 200);
  checkEqual("lifetime allocation read names the mode", lifetimeAllocation.json?.mode, "lifetime");
  checkEqual("lifetime allocation read makes no daily claim", lifetimeAllocation.json?.daily, null);
  checkEqual("lifetime allocation read returns the granted balance", lifetimeAllocation.json?.lifetime?.granted, 300);
  checkEqual("trial does not charge credit", (await db.prepare("SELECT credit_micros::int AS credit_micros FROM users WHERE id = ?").get(customerA.userId)).credit_micros, 0);
  checkEqual("lifetime mode does not also grant daily credits", (await db.prepare("SELECT COUNT(*)::int AS n FROM free_pool_allocations WHERE user_id = ?").get(customerA.userId)).n, 0);
  const before = calls;

  checkEqual("exhaustion asks for credit", (await chat(customerA)).status, 402);
  checkEqual("unfunded request stays local", calls, before);
  await db.prepare("UPDATE users SET credit_micros = 5000 WHERE id = ?").run(customerA.userId);
  checkEqual("funded call succeeds", (await chat(customerA)).status, 200);
  checkEqual("funded call uses paid counterpart", serving, "mock-upstream-model");
  checkEqual("funded call debits exact unequal rates", (await db.prepare("SELECT credit_micros::int AS credit_micros FROM users WHERE id = ?").get(customerA.userId)).credit_micros, 4800);
  const usage = await db.prepare("SELECT * FROM usage_events WHERE user_id = ? AND billing_source = 'credit'").get(customerA.userId);

  checkEqual("requested id retained", usage.model_id, "free/mock");
  checkEqual("actual upstream retained", usage.serving_upstream_id, "mock-upstream-model");
  checkEqual("paid call does not renew trial", (await db.prepare("SELECT used_tokens::int AS used_tokens FROM trial_grants WHERE user_id = ?").get(customerA.userId)).used_tokens, 300);
  await db.prepare("UPDATE users SET credit_micros = 0 WHERE id = ?").run(customerA.userId);
  checkEqual("paid credit exhaustion stops requests", (await chat(customerA)).status, 402);
  const secondKey = await request(baseUrl, "/api/account/keys", {
    method: "POST", cookie: customerA.cookie, body: { name: "Another key" },
  });

  checkEqual("new key cannot renew trial", (await chat({ ...customerA, secret: secondKey.json.secret })).status, 402);
  const catalog = await request(baseUrl, "/v1/models", { headers: { authorization: `Bearer ${customerA.secret}` } });

  checkEqual("model API publishes fallback output rate", catalog.json.data.find((m) => m.id === "free/mock").trial_paid_transition.output_price_per_1m, 2);
  const customerB = await customer("trial-b@example.test");

  quotaFails = true;
  checkEqual("unavailable current capacity refuses trial", (await chat(customerB)).status, 429);
  await refresh();
  fail = true;
  checkEqual("upstream error relayed safely", (await chat(customerB)).status, 502);
  checkEqual("failed call releases trial hold", (await db.prepare("SELECT used_tokens::int AS used_tokens FROM trial_grants WHERE user_id = ?").get(customerB.userId)).used_tokens, 0);
  fail = false;
  const streamed = await chat(customerB, { stream: true });

  checkEqual("trial SSE succeeds", streamed.status, 200);
  checkEqual("trial SSE forwards DONE", streamed.text.includes("[DONE]"), true);
  checkEqual("trial SSE settles weighted usage", (await db.prepare("SELECT used_tokens::int AS used_tokens FROM trial_grants WHERE user_id = ?").get(customerB.userId)).used_tokens, 300);
  const customerC = await customer("trial-c@example.test");
  const concurrent = await Promise.all([
    chat(customerC, { max_tokens: 120 }),
    chat(customerC, { max_tokens: 120 }),
    chat(customerC, { max_tokens: 120 }),
  ]);

  const concurrentStatuses = concurrent.map((r) => r.status).sort();

  checkEqual("concurrent calls admit only one trial", concurrentStatuses.filter((status) => status === 200).length, 1);
  // A concurrent provider-capacity check legitimately refuses with 429; a
  // customer already out of trial without credit gets 402. Both are refusals,
  // and neither may create a second trial or spend credit.
  check(
    "competing calls are refused without another trial",
    concurrentStatuses.filter((status) => status === 402 || status === 429).length === 2,
    `statuses ${concurrentStatuses.join(", ")}; ${concurrent
      .map((r) => `${r.status}:${r.json?.error?.code ?? r.json?.error?.type ?? "unknown"}:${r.json?.error?.message ?? ""}`)
      .join(" | ")}`,
  );
  checkEqual(
    "competing calls do not spend credit",
    (await db.prepare("SELECT credit_micros::int AS credit_micros FROM users WHERE id = ?").get(customerC.userId)).credit_micros,
    0,
  );
  checkEqual("customer receives exactly one grant", (await db.prepare("SELECT COUNT(*)::int AS total FROM trial_grants WHERE user_id = ?").get(customerC.userId)).total, 1);
  await db.prepare("UPDATE models SET status = 'disabled' WHERE id = 'mock-paid'").run();
  checkEqual("disabled paid pair stops conversion", (await chat(customerA)).status, 503);
  await db.prepare("UPDATE models SET status = 'active' WHERE id = 'mock-paid'").run();
  remaining = 1;
  const customerD = await customer("trial-d@example.test");

  checkEqual("pool depletion stops trial", (await chat(customerD)).status, 429);
  checkEqual("capacity failure does not issue a grant", (await db.prepare("SELECT COUNT(*)::int AS total FROM trial_grants WHERE user_id = ?").get(customerD.userId)).total, 0);
  console.log("trial-http-suite: all checks PASS");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`trial-http-suite FAIL: ${message}`);
  if (server) {
    console.error(`trial-http-suite: server log tail\n${logTail(server.logs)}`);
  }
  process.exitCode = 1;
} finally {
  await db?.close();
  if (server) await stopNextServer(server.child);
  await databaseServer?.close();
  await new Promise((resolve) => mock.close(resolve));
}
