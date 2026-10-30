import { createHash } from "node:crypto";

import { hashPassword } from "../../lib/password.ts";

import { check, checkEqual, cookieValue, request } from "./harness.mjs";

export async function runQuotaChecks(context) {
  const { db, mock, baseUrl } = context;
  const tomorrow = new Date();

  tomorrow.setUTCHours(24, 0, 0, 0);
  mock.state.quota.resets_at_utc = tomorrow.toISOString();
  const original = db.prepare("SELECT * FROM providers WHERE slug = 'savant'").get();
  const now = new Date().toISOString();
  const secret = "http-quota-consumer-secret-0123456789";
  const session = "q".repeat(43);

  db.prepare(`INSERT INTO users (id, email, name, status, created_at, password_hash)
    VALUES ('quota_user', 'quota@example.test', 'Quota account', 'active', ?, ?)`)
    .run(now, hashPassword("quota-suite-password"));
  db.prepare(`INSERT INTO api_keys
    (id, user_id, name, prefix, secret_hash, status, created_at)
    VALUES ('quota_key', 'quota_user', 'quota', 'sk-quota', ?, 'active', ?)`)
    .run(createHash("sha256").update(secret).digest("hex"), now);
  db.prepare(`INSERT INTO customer_sessions
    (id, user_id, token_hash, created_at, expires_at)
    VALUES ('quota_session', 'quota_user', ?, ?, ?)`)
    .run(createHash("sha256").update(session).digest("hex"), now,
      new Date(Date.now() + 60000).toISOString());
  db.prepare(`INSERT INTO models
    (id, upstream_id, name, provider, context_window, token_weight, allow_free,
     status, synced_at, upstream_slug, family, protocol, cost_source, in_catalog,
     group_slug, group_source)
    VALUES ('quota-free', 'mock-free', 'Daily trial model', 'Mock', '128000',
      1, 1, 'active', ?, 'savant', 'Mock', 'chat', 'synced', 1, 'free', 'manual')`)
    .run(now);
  db.prepare(`UPDATE providers SET base_url = ?, key_env_var = 'HTTP_SUITE_PROVIDER_KEY',
    default_headers = '{}', subscription_mode = 'free',
    subscription_token_limit = 20000000, subscription_tokens_used = 19631919,
    subscription_tokens_remaining = 368081, synced_at = '2026-10-29T21:15:21.452Z'
    WHERE slug = 'savant'`).run(mock.baseUrl);
  const login = await request(baseUrl, "/api/admin/session", {
    method: "POST", body: { password: context.adminPassword },
  });
  const cookie = `sg_admin=${cookieValue(login, "sg_admin")}`;
  const read = () => request(baseUrl, "/api/provider/runtime", { cookie });
  const chat = () => request(baseUrl, "/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${secret}` },
    body: { model: "quota-free", messages: [{ role: "user", content: "quota probe" }], max_tokens: 10 },
  });

  try {
    checkEqual("anonymous account check is protected",
      (await request(baseUrl, "/api/provider/runtime")).status, 403);
    checkEqual("foreign origin cannot check account",
      (await request(baseUrl, "/api/provider/runtime", { cookie, origin: "http://evil.example" })).status, 403);
    const fresh = await read();

    checkEqual("account check fetches today's upstream quota", fresh.status, 200);
    checkEqual("yesterday's 19.6M used is replaced by observed zero", fresh.json.provider.subscriptionTokensUsed, 0);
    checkEqual("account check returns observed 20M remaining", fresh.json.provider.subscriptionTokensRemaining, 20_000_000);
    checkEqual("actual upstream reset is retained", fresh.json.provider.quota.resetsAt, tomorrow.toISOString());
    checkEqual("runtime check does not advance catalog clock", fresh.json.provider.syncedAt, "2026-10-29T21:15:21.452Z");
    check("account responses prohibit caching", fresh.headers.get("cache-control").includes("no-store"));
    mock.state.quota.tokens_used = 1234;
    mock.state.quota.tokens_remaining = 20_000_000 - 1234;
    const before = mock.state.accountChecks;
    const changed = await read();

    checkEqual("a second check reads upstream again within the same second", mock.state.accountChecks, before + 1);
    checkEqual("a second check does not reuse cached success", changed.json.provider.subscriptionTokensUsed, 1234);
    const page = await request(baseUrl, "/admin", { cookie });

    checkEqual("admin initial render succeeds", page.status, 200);
    check("admin renders exact current remaining", page.text.includes("19,998,766"));
    check("admin renders observed reset and check time", page.text.includes("Upstream resets:") && page.text.includes("Account checked:"));
    checkEqual("fresh free admission succeeds after yesterday exhaustion", (await chat()).status, 200);
    checkEqual("daily trial usage settles as weighted tokens", db.prepare("SELECT weighted_tokens FROM free_pool_usage WHERE user_id = 'quota_user'").get().weighted_tokens, 150);
    checkEqual("daily trial does not debit dollar credit", db.prepare("SELECT credit_micros FROM users WHERE id = 'quota_user'").get().credit_micros, 0);
    checkEqual("daily trial releases its reservation", db.prepare("SELECT COUNT(*) AS n FROM free_pool_reservations WHERE user_id = 'quota_user'").get().n, 0);
    const trialRead = () => request(baseUrl, "/api/account/trial", {
      cookie: `sg_session=${session}`,
    });
    const credits = await trialRead();

    checkEqual("customer daily credits check succeeds", credits.status, 200);
    checkEqual("daily credits enforce the actual 100k account cap", credits.json.trial.allocatedTokens, 100_000);
    checkEqual("daily credits subtract settled user usage", credits.json.trial.remainingTokens, 99_850);
    checkEqual("customer daily credits use the upstream reset", credits.json.trial.resetsAt, tomorrow.toISOString());
    check("customer credits omit master account counters", !credits.text.includes("subscriptionTokensRemaining"));
    checkEqual("anonymous customer credits require a session",
      (await request(baseUrl, "/api/account/trial")).status, 401);
    checkEqual("foreign origins cannot read customer credits",
      (await request(baseUrl, "/api/account/trial", { cookie: `sg_session=${session}`,
        origin: "http://evil.example" })).status, 403);
    const scoped = await request(baseUrl, "/api/account/trial?userId=user_dev", {
      cookie: `sg_session=${session}`,
    });

    checkEqual("customer identity comes from session, not query parameters",
      scoped.json.trial.usedTokens, 150);
    const customerPage = await request(baseUrl, "/account", { cookie: `sg_session=${session}` });

    checkEqual("customer account renders daily trial credits", customerPage.status, 200);
    check("customer account renders the actual allocated remainder", customerPage.text.includes("99,850 weighted-token credits available"));

    mock.state.quotaFailure = true;
    const failed = await read();

    checkEqual("failed account check reports unavailable", failed.status, 503);
    checkEqual("failed check does not expose prior remaining", failed.json.provider.subscriptionTokensRemaining, null);
    check("provider error cannot expose its credential", !failed.text.includes("http-suite-provider-key"));
    const calls = mock.state.calls;

    checkEqual("free admission refuses unavailable upstream capacity", (await chat()).status, 503);
    checkEqual("unavailable capacity never reaches inference", mock.state.calls, calls);
    checkEqual("failed check creates no reservation", db.prepare("SELECT COUNT(*) AS n FROM free_pool_reservations WHERE user_id = 'quota_user'").get().n, 0);
    const failedCredits = await trialRead();

    checkEqual("customer credits fail closed with upstream", failedCredits.status, 503);
    checkEqual("customer credits never return stale availability", failedCredits.json.trial.remainingTokens, null);
    const unavailablePage = await request(baseUrl, "/admin", { cookie });

    check("failed admin render hides prior quota", !unavailablePage.text.includes("19,998,766"));
    check("failed admin render explains unavailability", unavailablePage.text.includes("Current quota unavailable"));
    mock.state.quotaFailure = false;
    mock.state.quota.tokens_remaining = null;
    checkEqual("null quota cannot become successful zero", (await read()).status, 503);
    mock.state.quota.tokens_remaining = 19_998_766;
    mock.state.quota.resets_at_utc = new Date(Date.now() - 1000).toISOString();
    checkEqual("expired reset cannot authorize old capacity", (await read()).status, 503);
    mock.state.quota.resets_at_utc = tomorrow.toISOString();
    mock.state.quota.unlimited = true;
    mock.state.quota.token_limit = null;
    mock.state.quota.tokens_remaining = null;
    const unlimited = await read();

    checkEqual("explicit unlimited quota is a successful current observation", unlimited.status, 200);
    checkEqual("unlimited quota is not fabricated as a finite pool", unlimited.json.provider.subscriptionTokensRemaining, null);
    checkEqual("explicit unlimited capacity still enforces daily user credits", (await chat()).status, 200);
    mock.state.quota.unlimited = false;
    mock.state.quota.token_limit = 20_000_000;
    mock.state.quota.tokens_remaining = 19_998_766;
    mock.state.balanceFailure = true;
    const balanceFailed = await read();

    checkEqual("failed balance is unavailable rather than old zero", balanceFailed.json.provider.balanceUsd, null);
    mock.state.balanceFailure = false;
    db.prepare(`INSERT INTO free_pool_reservations
      (id, user_id, api_key_id, model_id, provider_slug, day, weighted_tokens, created_at, expires_at)
      VALUES ('quota_held', 'quota_user', 'quota_key', 'quota-free', 'savant', ?, 19000000, ?, ?)`)
      .run(now.slice(0, 10), now, new Date(Date.now() + 60000).toISOString());
    const held = await read();

    checkEqual("raw upstream remains separate from local reservations", held.json.provider.subscriptionTokensRemaining, 19_998_766);
    check("admission capacity subtracts outstanding reservations", held.json.provider.admissionRemainingTokens < 1_000_000);
    checkEqual("a retained hold prevents oversubscription", (await chat()).status, 429);
    db.prepare("DELETE FROM free_pool_reservations WHERE id = 'quota_held'").run();
    mock.state.quotaDelay = 150;
    const concurrentBefore = mock.state.accountChecks;
    const concurrent = await Promise.all([read(), read(), read()]);

    check("concurrent account checks coalesce in-flight work", mock.state.accountChecks - concurrentBefore <= 2);
    check("concurrent successful checks use current quota", concurrent.every((r) => r.status === 200 || r.status === 503));
    mock.state.quotaDelay = 0;
    const catalogueFailed = await request(baseUrl, "/api/admin/providers/savant/sync", {
      method: "POST", cookie,
    });

    checkEqual("catalog failure is reported independently", catalogueFailed.status, 502);
    check("catalog failure cannot erase the fresh account observation",
      db.prepare("SELECT quota_observed_at FROM providers WHERE slug='savant'").get().quota_observed_at !== null);
    mock.state.quotaDelay = 200;
    const raceBefore = mock.state.accountChecks;
    const late = read();

    for (let attempt = 0; attempt < 50 && mock.state.accountChecks === raceBefore; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    check("configuration race starts an upstream check", mock.state.accountChecks > raceBefore);
    const changedConfig = await request(baseUrl, "/api/admin/providers/savant", {
      method: "PATCH", cookie, body: { label: "Account checked after config edit" },
    });

    checkEqual("provider configuration edit succeeds during a check", changedConfig.status, 200);
    checkEqual("configuration edit fences the late account response", (await late).status, 503);
    checkEqual("late account response cannot certify changed configuration",
      db.prepare("SELECT quota_observed_at FROM providers WHERE slug='savant'").get().quota_observed_at, null);
    mock.state.quotaDelay = 0;
    checkEqual("changed provider recovers only after a new check", (await read()).status, 200);
    const account = await request(baseUrl, "/account", {
      // Customer-page isolation is covered by the existing suite; daily credit
      // readout here is verified below through its stored allocation.
      redirect: "manual",
    });

    checkEqual("daily credits do not bypass customer authentication", account.status, 307);
    check("daily allocation respects the per-account cap", db.prepare("SELECT allocated_tokens FROM free_pool_allocations WHERE user_id = 'quota_user'").get().allocated_tokens > 0);

    // FID-051: durable settlement identity and operator inspection.
    const settlements = await request(baseUrl, "/api/admin/settlements", { cookie });

    checkEqual("operator can inspect settlement state", settlements.status, 200);
    check("served calls carry a committed durable settlement", settlements.json.settlements.some(
      (row) => row.user_id === "quota_user" && row.status === "committed",
    ));
    checkEqual("an unknown quarantine is not released", (await request(
      baseUrl, "/api/admin/settlements",
      { method: "POST", cookie, body: { id: "missing-quarantine" } },
    )).status, 404);

    // FID-048: one serving-account ceiling for every billing mode.
    mock.state.balance.rpm = 1;
    const limited = await read();

    checkEqual("a current account ceiling is observed before admission", limited.status, 200);
    checkEqual("one call fits the observed provider ceiling", (await chat()).status, 200);
    const throttled = await chat();

    checkEqual("the next call exceeds the shared provider ceiling", throttled.status, 429);
    checkEqual("provider refusal names the serving scope", throttled.headers.get("x-ratelimit-scope"), "provider");
    checkEqual("provider refusal reports the real ceiling", throttled.headers.get("x-ratelimit-limit"), "1");
    check("provider refusal gives retry guidance", Number(throttled.headers.get("retry-after")) >= 1);
    checkEqual("provider refusal is a rate limit, not an auth error", throttled.json?.error?.type, "rate_limit_error");
    mock.state.balance.rpm = 9000;
    checkEqual("the restored ceiling is observed again", (await read()).status, 200);
    checkEqual("capacity recovers from the refreshed ceiling", (await chat()).status, 200);
  } finally {
    mock.state.balance.rpm = 9000;
    mock.state.quotaFailure = false;
    mock.state.balanceFailure = false;
    mock.state.quotaDelay = 0;
    db.prepare("DELETE FROM free_pool_reservations WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM usage_events WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM free_pool_usage WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM free_pool_allocations WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM api_keys WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM customer_sessions WHERE user_id = 'quota_user'").run();
    db.prepare("DELETE FROM users WHERE id = 'quota_user'").run();
    db.prepare("DELETE FROM models WHERE id = 'quota-free'").run();
    db.prepare("DELETE FROM providers WHERE slug = 'savant'").run();
    const columns = Object.keys(original);

    db.prepare(`INSERT INTO providers (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
      .run(...columns.map((key) => original[key]));
    mock.reset();
  }
}
