import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { issueAccountAction, recordActionDelivery, consumeAccountAction } from "../lib/account-actions.ts";
import { readAccountEmailConfig, sendAccountEmail } from "../lib/account-email.ts";
import { accountActionSchema } from "../lib/schema/account-actions.ts";

function database(path = ":memory:") {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, status TEXT, password_hash TEXT, email_verified_at TEXT);
    CREATE TABLE customer_sessions (user_id TEXT, revoked_at TEXT);
    CREATE TABLE api_keys (user_id TEXT, status TEXT);
    INSERT INTO users VALUES ('a', 'a@example.test', 'active', 'old-password-hash', NULL);
    INSERT INTO customer_sessions VALUES ('a', NULL);
    INSERT INTO api_keys VALUES ('a', 'active');
  `);
  accountActionSchema(db);
  return db;
}
const issue = (db, purpose = "verify", now = 100) => issueAccountAction(db, { userId: "a", email: "a@example.test", purpose, now });
const consume = (db, token, purpose = "verify", now = 101) => consumeAccountAction(db, { token, purpose, now, ...(purpose === "reset" ? { passwordHash: "new-password-hash" } : {}) });

test("tokens are hashed, purpose bound, delivered before use and consumed once", () => {
  const db = database();
  try {
    const action = issue(db);
    assert.equal(action.token.length, 43);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM account_actions").all()).includes(action.token), false);
    assert.equal(consume(db, action.token), false);
    recordActionDelivery(db, action.id, true);
    assert.equal(consume(db, action.token, "reset"), false);
    assert.equal(consume(db, action.token), true);
    assert.ok(db.prepare("SELECT email_verified_at FROM users").get().email_verified_at);
    assert.equal(consume(db, action.token), false);
  } finally { db.close(); }
});

test("resend invalidates earlier tokens even when delivery finishes out of order", () => {
  const db = database();
  try {
    const first = issue(db);
    const second = issue(db, "verify", 102);
    recordActionDelivery(db, second.id, true);
    recordActionDelivery(db, first.id, true);
    assert.equal(consume(db, first.token, "verify", 103), false);
    assert.equal(consume(db, second.token, "verify", 103), true);
    assert.ok(issue(db, "verify", 104));
    assert.equal(issue(db, "verify", 105), null);
    assert.ok(issue(db, "verify", 3_600_106));
  } finally { db.close(); }
});

test("expiry, current email, suspension and failed delivery all refuse ownership", () => {
  for (const fault of ["expiry", "email", "suspended", "delivery"]) {
    const db = database();
    try {
      const action = issue(db);
      recordActionDelivery(db, action.id, fault !== "delivery");
      if (fault === "email") db.prepare("UPDATE users SET email = 'new@example.test'").run();
      if (fault === "suspended") db.prepare("UPDATE users SET status = 'suspended'").run();
      assert.equal(consume(db, action.token, "verify", fault === "expiry" ? action.expiresAt : 101), false, fault);
      assert.equal(db.prepare("SELECT email_verified_at FROM users").get().email_verified_at, null);
    } finally { db.close(); }
  }
});

test("password reset atomically revokes sessions, keys and outstanding actions", () => {
  const db = database();
  try {
    const verification = issue(db);
    recordActionDelivery(db, verification.id, true);
    const action = issue(db, "reset");
    recordActionDelivery(db, action.id, true);
    assert.equal(consume(db, action.token, "reset"), true);
    assert.equal(db.prepare("SELECT password_hash FROM users").get().password_hash, "new-password-hash");
    assert.ok(db.prepare("SELECT revoked_at FROM customer_sessions").get().revoked_at);
    assert.equal(db.prepare("SELECT status FROM api_keys").get().status, "revoked");
    assert.equal(consume(db, verification.token), false);
  } finally { db.close(); }
});

test("a failed reset transaction rolls back consumption and every access change", () => {
  const db = database();
  try {
    const action = issue(db, "reset");
    recordActionDelivery(db, action.id, true);
    db.exec("CREATE TRIGGER refuse_revoke BEFORE UPDATE ON api_keys BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    assert.throws(() => consume(db, action.token, "reset"), /fixture failure/);
    assert.equal(db.prepare("SELECT consumed_at FROM account_actions").get().consumed_at, null);
    assert.equal(db.prepare("SELECT password_hash FROM users").get().password_hash, "old-password-hash");
    assert.equal(db.prepare("SELECT revoked_at FROM customer_sessions").get().revoked_at, null);
  } finally { db.close(); }
});

test("two independent processes can consume one action only once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-actions-"));
  const path = join(directory, "actions.db");
  const db = database(path);
  const action = issue(db);
  recordActionDelivery(db, action.id, true);
  db.close();
  const moduleUrl = new URL("../lib/account-actions.ts", import.meta.url).href;
  const script = `import Database from 'better-sqlite3';
    import { consumeAccountAction } from ${JSON.stringify(moduleUrl)};
    const db = new Database(process.argv[1]); db.pragma('busy_timeout=10000');
    const result = consumeAccountAction(db, {token:process.argv[2],purpose:'verify',now:101});
    db.close(); process.stdout.write(String(result));`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, path, action.token]);
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(errors)));
  });
  try { assert.deepEqual((await Promise.all([run(), run()])).sort(), ["false", "true"]); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

const env = { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "fixture-key", EMAIL_FROM: "sender@example.test", NEXT_PUBLIC_SITE_URL: "https://gateway.example", NODE_ENV: "production" };
test("email is explicit opt-in with canonical origin and a pinned production endpoint", () => {
  assert.equal(readAccountEmailConfig({}), null);
  assert.ok(readAccountEmailConfig(env));
  for (const change of [{ EMAIL_FROM: "" }, { RESEND_API_KEY: "" }, { NEXT_PUBLIC_SITE_URL: "http://gateway.example" },
    { NEXT_PUBLIC_SITE_URL: "https://gateway.example/path" }, { RESEND_API_URL: "https://foreign.example/emails" }]) {
    assert.equal(readAccountEmailConfig({ ...env, ...change }), null);
  }
});

test("email transport uses fragment links, bounded retries and a stable idempotency key", async () => {
  const requests = [];
  const send = async (url, init) => {
    requests.push({ url, init });
    return requests.length === 1 ? new Response("unavailable", { status: 503 }) : Response.json({ id: "email-fixture" });
  };
  assert.equal(await sendAccountEmail({ config: readAccountEmailConfig(env), recipient: "a@example.test", purpose: "reset", token: "fixture-token", actionId: "action-fixture" }, send), true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].init.headers["Idempotency-Key"], requests[1].init.headers["Idempotency-Key"]);
  assert.match(JSON.parse(requests[0].init.body).text, /https:\/\/gateway.example\/account\/action#purpose=reset&token=fixture-token/);
  assert.equal(requests[0].init.redirect, "error");
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});

test("permanent delivery refusal is not retried or presented as success", async () => {
  let calls = 0;
  const input = { config: readAccountEmailConfig(env), recipient: "a@example.test", purpose: "verify", token: "fixture-token", actionId: "action-fixture" };
  assert.equal(await sendAccountEmail(input, async () => { calls++; return new Response("denied", { status: 403 }); }), false);
  assert.equal(calls, 1);
  assert.equal(await sendAccountEmail(input, async () => Response.json({ error: "not accepted" })), false);
});
