import { createServer } from "node:http";

import { check, checkEqual, cookieValue, request } from "./harness.mjs";

export async function startEmailDouble() {
  const state = { messages: [], fail: false, calls: 0, wait: null };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    state.calls++;
    if (state.wait) await state.wait;
    res.setHeader("content-type", "application/json");
    if (req.method !== "POST" || req.url !== "/emails" || req.headers.authorization !== "Bearer fixture-email-key") {
      res.writeHead(403); res.end('{"error":"fixture unauthorized"}'); return;
    }
    if (state.fail) { res.writeHead(503); res.end('{"error":"fixture unavailable"}'); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    state.messages.push({ ...body, idempotencyKey: req.headers["idempotency-key"] });
    res.end(JSON.stringify({ id: `email_${state.messages.length}` }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}/emails`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function linkFromMessage(message) {
  const match = message.text.match(/https?:\/\/[^\s]+/);
  if (!match) throw new Error("Account email is missing its action link.");
  const link = new URL(match[0]);
  const params = new URLSearchParams(link.hash.slice(1));
  return { link, token: params.get("token"), purpose: params.get("purpose") };
}

export async function runAccountRecoveryChecks({ baseUrl, db, email }) {
  const address = "recovery.http-suite@example.test";
  const password = "recovery-old-password";
  const registration = await request(baseUrl, "/api/auth/signup", { method: "POST", body: {
    name: "Recovery Probe", email: address, password, acceptedPolicies: true,
  } });
  checkEqual("recovery account signup works", registration.status, 201);
  const userId = registration.json.customer.id;
  const cookie = `sg_session=${cookieValue(registration, "sg_session")}`;
  const actionRequest = (body, options = {}) => request(baseUrl, "/api/auth/email/request", { method: "POST", body, ...options });
  const awaitDelivery = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const row = db.prepare("SELECT delivery_state FROM account_actions WHERE user_id = ? AND purpose = 'reset' ORDER BY created_at DESC LIMIT 1").get(userId);
      if (row && row.delivery_state !== "pending") return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Account email fixture did not finish delivery.");
  };
  const consume = (action, extra = {}) => request(baseUrl, "/api/auth/email/consume", { method: "POST", body: {
    token: action.token, purpose: action.purpose, ...extra,
  } });
  checkEqual("verification request requires sign in", (await actionRequest({ purpose: "verify" })).status, 401);
  checkEqual("foreign origin cannot send account mail", (await actionRequest({ purpose: "verify" }, { cookie, origin: "https://foreign.example" })).status, 403);
  checkEqual("signed-in verification requests real transport", (await actionRequest({ purpose: "verify" }, { cookie })).status, 200);
  const verification = linkFromMessage(email.state.messages.at(-1));
  checkEqual("mail link uses the canonical site origin", verification.link.origin, baseUrl);
  checkEqual("mail link keeps token out of query strings", verification.link.search, "");
  check("mail transport uses an idempotency key", Boolean(email.state.messages.at(-1).idempotencyKey));
  checkEqual("request and delivery do not verify ownership", db.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(userId).email_verified_at, null);
  checkEqual("action page is reachable without a session", (await request(baseUrl, verification.link.pathname)).status, 200);
  checkEqual("GET does not consume the action", db.prepare("SELECT consumed_at FROM account_actions WHERE user_id = ?").get(userId).consumed_at, null);
  checkEqual("purpose substitution is refused", (await consume(verification, { purpose: "reset", password: "new-valid-password" })).status, 400);
  checkEqual("verification consumes through production route", (await consume(verification)).status, 200);
  check("verification route writes ownership", Boolean(db.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(userId).email_verified_at));
  checkEqual("verification replay is refused", (await consume(verification)).status, 400);
  const account = await request(baseUrl, "/account", { cookie });
  check("account renders verified state", account.text.includes("Your email address is verified"));
  const key = await request(baseUrl, "/api/account/keys", { method: "POST", cookie, body: { name: "Recovery key" } });
  checkEqual("recovery test creates a key", key.status, 201);

  let release;
  email.state.wait = new Promise((resolve) => { release = resolve; });
  let known;
  let deadline;
  try {
    known = await Promise.race([
      actionRequest({ purpose: "reset", email: address }),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Recovery response waits for delivery and leaks account existence.")), 1000); }),
    ]);
    checkEqual("recovery response does not wait for account-specific delivery", known.status, 200);
  } finally {
    clearTimeout(deadline);
    release();
    email.state.wait = null;
  }
  await awaitDelivery();
  const unknown = await actionRequest({ purpose: "reset", email: "absent.recovery@example.test" });
  checkEqual("recovery response is enumeration-safe", known.text, unknown.text);
  checkEqual("known and unknown recovery share status", known.status, unknown.status);
  const reset = linkFromMessage(email.state.messages.at(-1));
  checkEqual("new recovery request succeeds", (await actionRequest({ purpose: "reset", email: address })).status, 200);
  await awaitDelivery();
  const newest = linkFromMessage(email.state.messages.at(-1));
  checkEqual("superseded reset link is refused", (await consume(reset, { password: "recovery-new-password" })).status, 400);
  checkEqual("cross-origin consumption is refused", (await request(baseUrl, "/api/auth/email/consume", {
    method: "POST", origin: "https://foreign.example", body: { ...newest, password: "recovery-new-password" },
  })).status, 403);
  checkEqual("reset consumes through production route", (await consume(newest, { password: "recovery-new-password" })).status, 200);
  checkEqual("reset revokes the old customer session", (await request(baseUrl, "/api/auth/me", { cookie })).status, 401);
  checkEqual("reset revokes the old API key", (await request(baseUrl, "/v1/models", { headers: { authorization: `Bearer ${key.json.secret}` } })).status, 401);
  checkEqual("old password stops working", (await request(baseUrl, "/api/auth/login", { method: "POST", body: { email: address, password } })).status, 401);
  checkEqual("new password signs in", (await request(baseUrl, "/api/auth/login", { method: "POST", body: { email: address, password: "recovery-new-password" } })).status, 200);

  email.state.fail = true;
  const failed = await actionRequest({ purpose: "reset", email: address });
  await awaitDelivery();
  checkEqual("delivery failure does not expose account existence", failed.text, unknown.text);
  checkEqual("delivery failure is durably visible", db.prepare("SELECT delivery_state FROM account_actions WHERE user_id = ? AND purpose = 'reset' ORDER BY created_at DESC LIMIT 1").get(userId).delivery_state, "failed");
  email.state.fail = false;
  const count = email.state.calls;
  checkEqual("per-address request limit stays generic", (await actionRequest({ purpose: "reset", email: address })).text, unknown.text);
  checkEqual("throttled recovery sends nothing", email.state.calls, count);
  const recovery = await request(baseUrl, "/recover");
  checkEqual("recovery page is reachable", recovery.status, 200);
  check("recovery page explains session and key revocation", recovery.text.includes("revokes all sessions and API keys"));
}
