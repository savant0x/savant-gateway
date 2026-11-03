import { randomBytes, randomUUID, createHash } from "node:crypto";

import { check, checkEqual, cookieValue, request } from "./harness.mjs";

/** An isolated account keeps limit probes independent of later money receipts. */
export async function runRequestLimitChecks({ baseUrl, db, mock, adminPassword }) {
  const now = new Date().toISOString();
  const id = `user_limits_${randomUUID()}`;
  const token = randomBytes(32).toString("base64url");
  const cookie = `sg_session=${token}`;
  const hash = (value) => createHash("sha256").update(value).digest("hex");

  await db
    .prepare("INSERT INTO users (id, email, name, status, password_hash, created_at) VALUES (?, ?, 'Limits', 'active', 'fixture-only', ?)")
    .run(id, `${id}@example.test`, now);
  await db
    .prepare("INSERT INTO customer_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(`session_${id}`, id, hash(token), new Date(Date.now() + 3600000).toISOString(), now);

  const createKey = () => request(baseUrl, "/api/account/keys", { method: "POST", cookie, body: { name: "Bounded key" } });
  const first = await createKey();

  checkEqual("limit probe creates a key", first.status, 201);
  const secret = first.json.secret;
  const before = mock.state.calls;
  const valid = { model: "mock-paid", messages: [{ role: "user", content: "ping" }], max_tokens: 8 };

  for (const body of [null, [], { ...valid, n: 2 }, { ...valid, max_tokens: "8" },
    { ...valid, max_completion_tokens: 8, max_tokens: -1 }, { ...valid, messages: [null] }]) {
    const response = await request(baseUrl, "/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${secret}` }, body,
    });
    checkEqual("invalid inference resources return 400", response.status, 400);
  }
  const huge = await request(baseUrl, "/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${secret}` },
    body: { ...valid, padding: "x".repeat(2 * 1024 * 1024) },
  });
  checkEqual("oversized inference returns 413", huge.status, 413);
  checkEqual("invalid requests never dispatch upstream", mock.state.calls, before);
  checkEqual("invalid requests never create credit holds", (await db.prepare("SELECT COUNT(*)::int AS n FROM credit_holds WHERE user_id = ?").get(id)).n, 0);
  checkEqual("invalid requests never open settlements", (await db.prepare("SELECT COUNT(*)::int AS n FROM settlements WHERE user_id = ?").get(id)).n, 0);

  for (const path of ["/api/auth/signup", "/api/auth/login", "/api/account/keys", "/api/account/support", "/api/account/policies"]) {
    const bad = await request(baseUrl, path, { method: "POST", cookie, body: null });
    checkEqual(`${path} rejects null safely`, bad.status, 400);
    const large = await request(baseUrl, path, { method: "POST", cookie, body: { padding: "x".repeat(65536) } });
    checkEqual(`${path} bounds body bytes`, large.status, 413);
  }

  const admin = await request(baseUrl, "/api/admin/session", { method: "POST", body: { password: adminPassword } });
  checkEqual("limit probe signs in operator", admin.status, 200);
  const adminCookie = `sg_admin=${cookieValue(admin, "sg_admin")}`;
  for (const [path, method] of [["credit", "POST"], ["pricing", "PATCH"], ["models", "PATCH"],
    ["support", "PATCH"], ["plans", "PATCH"], ["groups", "DELETE"], ["subscriptions", "POST"],
    ["gateway", "PATCH"], ["benchmarks", "POST"], ["adjustments", "POST"],
    ["settlements", "POST"], ["reconciliation", "POST"], ["providers", "POST"]]) {
    const response = await request(baseUrl, `/api/admin/${path}`, { method, cookie: adminCookie, body: null });
    checkEqual(`${path} operator mutation rejects null safely`, response.status, 400);
  }

  const attempts = await Promise.all(Array.from({ length: 12 }, createKey));
  checkEqual("concurrent creation reaches exactly ten active keys", attempts.filter((r) => r.status === 201).length, 9);
  checkEqual("concurrent excess key creation is refused", attempts.filter((r) => r.status === 429).length, 3);
  checkEqual("key ceiling is persisted", (await db.prepare("SELECT COUNT(*)::int AS n FROM api_keys WHERE user_id = ? AND status = 'active'").get(id)).n, 10);
  const anotherSecret = attempts.find((response) => response.status === 201).json.secret;
  // Exceed the 60 RPM bucket without exceeding the separate provider
  // concurrency gate. Sequential probing is timing-dependent: a slow runner
  // refills a token between requests, so 120 probes can all pass. A single
  // 80-request burst instead hits provider concurrency first. Batches of three
  // stay under the default provider cap while still spending the account
  // bucket faster than it refills; 40 batches is double the bucket capacity.
  // Unfunded admissions must still refuse with 402 and never dispatch
  // upstream.
  const probes = [];

  for (let batch = 0; batch < 40; batch++) {
    const responses = await Promise.all(
      Array.from({ length: 3 }, (_, offset) => {
        const index = batch * 3 + offset;

        return request(baseUrl, "/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${index % 2 ? secret : anotherSecret}`,
          },
          body: valid,
        });
      }),
    );

    probes.push(...responses);
  }

  const limited = probes.find((probe) => probe.status === 429);

  for (const probe of probes) {
    if (probe.status !== 429) {
      checkEqual("unfunded capacity probe creates no charge", probe.status, 402);
    }
  }

  check("paid account limit holds across different keys", limited !== undefined);
  checkEqual("account refusal names paid rate scope", limited?.headers.get("x-ratelimit-scope"), "paid");
  checkEqual("capacity probes create no upstream spend", mock.state.calls, before);
  await db.prepare("UPDATE api_keys SET status = 'revoked' WHERE user_id = ?").run(id);
  for (let index = 0; index < 10; index++) {
    const created = await createKey();
    checkEqual("key churn within hourly budget works", created.status, 201);
    await db.prepare("UPDATE api_keys SET status = 'revoked' WHERE user_id = ?").run(id);
  }
  const churn = await createKey();
  checkEqual("revocation cannot bypass hourly key issuance", churn.status, 429);
  check("key refusal has Retry-After", Number(churn.headers.get("retry-after")) > 0);
  await db.prepare("DELETE FROM users WHERE id = ?").run(id);
}
