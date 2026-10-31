import { createHash } from "node:crypto";

import { check, checkEqual, cookieValue, request } from "./harness.mjs";

const USER = "ops_http_user";
const KEY = "ops_http_key";
const SECRET = "http-operations-key-0123456789abcdef";
const MODEL = "mock-paid";
const NOW = new Date().toISOString();

function insertFixture(db) {
  db.prepare(
    `INSERT OR REPLACE INTO users
      (id, email, name, status, created_at, credit_micros, held_micros)
     VALUES (?, 'ops-http@example.test', 'Operations probe', 'active', ?, 5000000, 0)`,
  ).run(USER, NOW);
  db.prepare(
    `INSERT OR REPLACE INTO api_keys
      (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES (?, ?, 'operations', 'sk-ops', ?, 'active', ?)`,
  ).run(KEY, USER, createHash("sha256").update(SECRET).digest("hex"), NOW);
  db.prepare("UPDATE providers SET enabled = 1 WHERE slug = 'mock'").run();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('operations.admission_state', 'open', ?)
     ON CONFLICT(key) DO UPDATE SET value = 'open', updated_at = excluded.updated_at`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('operations.admission_reason', '', ?)
     ON CONFLICT(key) DO UPDATE SET value = '', updated_at = excluded.updated_at`,
  ).run(NOW);
}

function cleanup(db) {
  db.prepare("DELETE FROM usage_events WHERE api_key_id = ?").run(KEY);
  db.prepare("DELETE FROM settlements WHERE api_key_id = ?").run(KEY);
  db.prepare("DELETE FROM credit_holds WHERE api_key_id = ?").run(KEY);
  db.prepare("DELETE FROM credit_ledger WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM free_pool_usage WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM free_pool_reservations WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM users WHERE id = ?").run(USER);
  db.prepare("DELETE FROM operations_incidents WHERE id = ?").run(
    "ops_http_incident",
  );
  db.prepare("UPDATE providers SET enabled = 1 WHERE slug = 'mock'").run();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('operations.admission_state', 'open', ?)
     ON CONFLICT(key) DO UPDATE SET value = 'open', updated_at = excluded.updated_at`,
  ).run(new Date().toISOString());
}

/**
 * Proves the one behavior a green page cannot: pause and drain refuse a real
 * authenticated gateway call before a hold/usage row is written, readiness and
 * the operator API stay reachable, resume restores service, and the provider
 * disable control is independent. The fixture account and probe incident are
 * removed in `finally` so the later main suite sees the same users.
 */
export async function runOperationsChecks(context) {
  const { baseUrl, db, adminPassword } = context;

  insertFixture(db);

  const chat = () =>
    request(baseUrl, "/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: {
        model: MODEL,
        messages: [{ role: "user", content: "operations probe" }],
        max_tokens: 8,
      },
    });
  const usageCount = () =>
    db
      .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE api_key_id = ?")
      .get(KEY).total;
  const holdCount = () =>
    db
      .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE api_key_id = ?")
      .get(KEY).total;

  try {
    const anonymous = await request(baseUrl, "/api/admin/operations");

    checkEqual("anonymous operations API is protected", anonymous.status, 401);

    const foreign = await request(baseUrl, "/api/admin/operations", {
      origin: "http://evil.example",
    });

    checkEqual("foreign-origin operations API is rejected", foreign.status, 403);

    const login = await request(baseUrl, "/api/admin/session", {
      method: "POST",
      body: { password: adminPassword },
    });
    const cookie = `sg_admin=${cookieValue(login, "sg_admin")}`;
    const read = () => request(baseUrl, "/api/admin/operations", { cookie });
    const act = (body) =>
      request(baseUrl, "/api/admin/operations", {
        method: "POST",
        cookie,
        body,
      });

    const initial = await read();

    checkEqual("operations API returns the overview", initial.status, 200);
    checkEqual(
      "operations starts with admission open",
      initial.json?.snapshot?.admission?.state,
      "open",
    );
    check(
      "operations exposes a traffic snapshot",
      typeof initial.json?.snapshot?.traffic?.requests === "number",
    );
    check(
      "operations exposes unresolved settlements",
      typeof initial.json?.snapshot?.settlements?.admitted === "number",
    );
    check(
      "operations exposes payment and quota state",
      typeof initial.json?.snapshot?.payments?.failed === "number" &&
        typeof initial.json?.snapshot?.quota?.enabledProviders === "number",
    );
    check(
      "unconfigured alert transport is visible, not silent",
      initial.json?.transport?.configured === false &&
        typeof initial.json?.transport?.problem === "string",
    );

    const page = await request(baseUrl, "/admin/operations", { cookie });

    checkEqual("operations page renders for the operator", page.status, 200);
    check(
      "operations page renders its heading",
      page.text.includes("Observation and incident response"),
    );

    db.prepare(
      `INSERT INTO operations_incidents
        (id, fingerprint, severity, status, title, detail, first_seen,
         last_seen, delivery_kind, delivery_state, delivery_attempts)
       VALUES ('ops_http_incident', 'http:ack', 'warning', 'open',
         'Acknowledgment probe', 'The HTTP suite seeds this row.', ?, ?, 'alert',
         'unconfigured', 0)`,
    ).run(NOW, NOW);

    const acknowledged = await act({
      action: "acknowledge",
      id: "ops_http_incident",
    });

    checkEqual("incident acknowledgment succeeds", acknowledged.status, 200);
    check(
      "incident acknowledgment is durable",
      typeof acknowledged.json?.incident?.acknowledgedAt === "string",
    );
    checkEqual(
      "unknown incident acknowledgment is a 404",
      (await act({ action: "acknowledge", id: "missing_incident" })).status,
      404,
    );

    db.prepare("DELETE FROM operations_incidents WHERE id = ?").run(
      "ops_http_incident",
    );

    const noReason = await act({ action: "pause" });

    checkEqual("pause without a reason is rejected", noReason.status, 400);

    const paused = await act({ action: "pause", reason: "HTTP suite drill" });

    checkEqual("pause with a reason succeeds", paused.status, 200);
    checkEqual(
      "pause changes the admission state",
      paused.json?.snapshot?.admission?.state,
      "paused",
    );

    const readyWhilePaused = await request(baseUrl, "/api/ready");

    checkEqual("readiness stays available while paused", readyWhilePaused.status, 200);
    checkEqual(
      "readiness discloses paused admission",
      readyWhilePaused.json?.admission,
      "paused",
    );

    const before = usageCount();
    const holdsBefore = holdCount();
    const refused = await chat();

    checkEqual("paused inference returns 503", refused.status, 503);
    check(
      "paused refusal names the state",
      String(refused.json?.error?.message ?? "").includes("paused"),
      refused.text.slice(0, 160),
    );
    checkEqual("paused refusal asks for a retry", refused.headers.get("retry-after"), "30");
    checkEqual("paused refusal writes no usage", usageCount(), before);
    checkEqual("paused refusal writes no credit hold", holdCount(), holdsBefore);

    const drained = await act({ action: "drain", reason: "HTTP suite drain" });

    checkEqual("drain with a reason succeeds", drained.status, 200);
    checkEqual(
      "drain changes the admission state",
      drained.json?.snapshot?.admission?.state,
      "draining",
    );

    const draining = await chat();

    checkEqual("draining inference returns 503", draining.status, 503);
    check(
      "draining refusal names the state",
      String(draining.json?.error?.message ?? "").includes("draining"),
      draining.text.slice(0, 160),
    );

    const resumed = await act({ action: "resume" });

    checkEqual("resume succeeds", resumed.status, 200);
    checkEqual(
      "resume opens admission",
      resumed.json?.snapshot?.admission?.state,
      "open",
    );

    const restored = await chat();

    check(
      "inference works after resume",
      restored.status === 200,
      restored.text.slice(0, 240),
    );
    check(
      "resumed call settles a usage row",
      usageCount() > before,
      `usage ${usageCount()}`,
    );

    const disabled = await act({
      action: "provider",
      slug: "mock",
      enabled: false,
    });

    checkEqual("provider disable succeeds", disabled.status, 200);
    checkEqual(
      "provider disable is visible",
      disabled.json?.providers?.find((provider) => provider.slug === "mock")
        ?.enabled,
      false,
    );

    const unavailable = await chat();

    checkEqual("disabled provider refuses the model", unavailable.status, 503);
    check(
      "disabled provider refusal names model availability",
      String(unavailable.json?.error?.message ?? "").includes("unavailable"),
    );

    const enabled = await act({
      action: "provider",
      slug: "mock",
      enabled: true,
    });

    checkEqual("provider enable succeeds", enabled.status, 200);
    checkEqual("inference works after provider enable", (await chat()).status, 200);

    const tick = await act({ action: "tick" });

    checkEqual("manual monitor tick succeeds", tick.status, 200);
    check(
      "manual monitor tick returns counters",
      typeof tick.json?.tick?.active === "number" &&
        typeof tick.json?.tick?.unconfigured === "number",
    );
    check(
      "manual tick keeps the unconfigured transport visible",
      tick.json?.transport?.configured === false,
    );
  } finally {
    cleanup(db);
  }
}
