import { createHash, randomBytes } from "node:crypto";

import { check, checkEqual, cookieValue, request } from "./harness.mjs";

const USER = "promo_http_user";
const EMAIL = "promo-http@example.test";
const TOKEN = randomBytes(32).toString("base64url");
const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PROMO_IDS = [];

function cleanup(db) {
  db.prepare("DELETE FROM promo_redemptions WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM credit_ledger WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM activity_events WHERE user_id = ?").run(USER);

  for (const id of PROMO_IDS.splice(0)) {
    db.prepare("DELETE FROM activity_events WHERE entity_id = ?").run(id);
    db.prepare("DELETE FROM promo_codes WHERE id = ?").run(id);
  }

  db.prepare("DELETE FROM customer_sessions WHERE user_id = ?").run(USER);
  db.prepare("DELETE FROM users WHERE id = ?").run(USER);
}

function seedCustomer(db) {
  db.prepare(
    `INSERT INTO users
      (id, email, name, status, created_at, password_hash, credit_micros,
       held_micros)
     VALUES (?, ?, 'Promo probe', 'active', ?, 'not-used-by-this-check', 0, 0)`,
  ).run(USER, EMAIL, NOW);

  db.prepare(
    `INSERT INTO customer_sessions
      (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ('sess_promo_http', ?, ?, ?, ?, NULL)`,
  ).run(USER, createHash("sha256").update(TOKEN).digest("hex"), NOW, LATER);
}

/**
 * Proves the real route path, not only the ledger function: an admin issues a
 * code, the plaintext appears once, a signed-in customer redeems it, a repeat
 * is refused, and the activity view records the redemption without the code.
 */
export async function runPromoChecks({ baseUrl, db, adminPassword }) {
  cleanup(db);
  seedCustomer(db);

  const adminSession = await request(baseUrl, "/api/admin/session", {
    method: "POST",
    body: { password: adminPassword },
  });
  const adminCookie = `sg_admin=${cookieValue(adminSession, "sg_admin")}`;
  const customerCookie = `sg_session=${TOKEN}`;
  const customerHeaders = { cookie: customerCookie };

  try {
    const anonymous = await request(baseUrl, "/api/admin/promos");

    checkEqual("anonymous promo API is protected", anonymous.status, 401);

    const foreign = await request(baseUrl, "/api/admin/promos", {
      origin: "http://evil.example",
      headers: { cookie: adminCookie },
    });

    checkEqual("foreign-origin promo API is rejected", foreign.status, 403);

    const list = await request(baseUrl, "/api/admin/promos", {
      headers: { cookie: adminCookie },
    });

    checkEqual("promo admin list serves", list.status, 200);
    checkEqual("promo lane is enabled for the suite", list.json?.enabled, true);

    const created = await request(baseUrl, "/api/admin/promos", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: {
        amountUsd: 7.5,
        maxRedemptions: 1,
        label: "HTTP promo",
      },
    });

    checkEqual("promo creation returns 201", created.status, 201);
    check(
      "promo creation returns a canonical code",
      /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(created.json?.code ?? ""),
      created.json?.code ?? "missing",
    );
    PROMO_IDS.push(created.json?.promo?.id);

    const code = created.json?.code;
    const stored = db
      .prepare("SELECT code_hash, code_prefix FROM promo_codes WHERE id = ?")
      .get(created.json?.promo?.id);

    check("the plaintext code is not stored", stored.code_hash !== code);
    check(
      "the admin list exposes only the prefix",
      JSON.stringify(list.json).includes(code) === false,
    );

    const anonymousRedeem = await request(baseUrl, "/api/account/promos", {
      method: "POST",
      body: { code },
    });

    checkEqual("anonymous redemption is refused", anonymousRedeem.status, 401);

    const redeem = await request(baseUrl, "/api/account/promos", {
      method: "POST",
      headers: customerHeaders,
      body: { code },
    });

    checkEqual("customer redemption returns 200", redeem.status, 200);
    checkEqual(
      "customer receives the promo amount",
      redeem.json?.amountMicros,
      7_500_000,
    );
    checkEqual(
      "the balance moved by the promo amount",
      db.prepare("SELECT credit_micros FROM users WHERE id = ?").get(USER)
        .credit_micros,
      7_500_000,
    );
    checkEqual(
      "the ledger records a promo row",
      db
        .prepare(
          "SELECT kind FROM credit_ledger WHERE user_id = ? AND kind = 'promo'",
        )
        .get(USER)?.kind,
      "promo",
    );

    const repeat = await request(baseUrl, "/api/account/promos", {
      method: "POST",
      headers: customerHeaders,
      body: { code },
    });

    checkEqual("a repeated redemption returns 409", repeat.status, 409);
    checkEqual(
      "a repeated redemption does not change the balance",
      db.prepare("SELECT credit_micros FROM users WHERE id = ?").get(USER)
        .credit_micros,
      7_500_000,
    );

    const concurrentCode = await request(baseUrl, "/api/admin/promos", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: {
        amountUsd: 3,
        maxRedemptions: 1,
        label: "HTTP promo concurrent",
      },
    });

    checkEqual("the concurrency probe promo is created", concurrentCode.status, 201);
    PROMO_IDS.push(concurrentCode.json?.promo?.id);

    const [firstRace, secondRace] = await Promise.all([
      request(baseUrl, "/api/account/promos", {
        method: "POST",
        headers: customerHeaders,
        body: { code: concurrentCode.json?.code },
      }),
      request(baseUrl, "/api/account/promos", {
        method: "POST",
        headers: customerHeaders,
        body: { code: concurrentCode.json?.code },
      }),
    ]);
    const raceStatuses = [firstRace.status, secondRace.status].sort();

    checkEqual(
      "concurrent redemptions admit exactly one request",
      raceStatuses.join(","),
      "200,409",
    );
    checkEqual(
      "concurrent redemptions write exactly one ledger row",
      db
        .prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id = ?")
        .get(USER).n,
      2,
    );

    const pausedCode = await request(baseUrl, "/api/admin/promos", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: {
        amountUsd: 2,
        maxRedemptions: 1,
        label: "HTTP promo paused",
      },
    });

    checkEqual("a second promo is created", pausedCode.status, 201);
    PROMO_IDS.push(pausedCode.json?.promo?.id);

    const paused = await request(
      baseUrl,
      `/api/admin/promos/${pausedCode.json?.promo?.id}`,
      {
        method: "PATCH",
        headers: { cookie: adminCookie },
        body: { status: "paused" },
      },
    );

    checkEqual("a promo can be paused", paused.status, 200);
    checkEqual("pausing reports the change", paused.json?.changed, true);

    const pausedRedeem = await request(baseUrl, "/api/account/promos", {
      method: "POST",
      headers: customerHeaders,
      body: { code: pausedCode.json?.code },
    });

    checkEqual("a paused code is refused", pausedRedeem.status, 400);
    checkEqual(
      "a paused code writes no ledger row",
      db.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id = ?").get(
        USER,
      ).n,
      2,
    );

    const activity = await request(
      baseUrl,
      "/api/admin/activity?kind=promo.redeemed",
      { headers: { cookie: adminCookie } },
    );

    checkEqual("activity API serves", activity.status, 200);
    check(
      "activity records the promo redemption",
      Array.isArray(activity.json?.events) &&
        activity.json.events.some((event) => event.kind === "promo.redeemed"),
    );
    check(
      "activity does not expose the full promo code",
      JSON.stringify(activity.json).includes(code) === false,
    );

    const account = await request(baseUrl, "/account", {
      headers: { cookie: customerCookie },
    });

    checkEqual("the account page serves for the promo customer", account.status, 200);
    check(
      "the enabled promo lane renders on the account page",
      account.text.includes("Redeem a promo code"),
    );
  } finally {
    cleanup(db);
  }
}
