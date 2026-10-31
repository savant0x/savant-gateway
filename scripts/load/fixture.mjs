import { createHash, randomBytes, randomUUID } from "node:crypto";

const PROVIDER_KEY_ENV = "LOAD_PROVIDER_KEY";
export const LOAD_PROVIDER_KEY_VALUE = "load-fixture-provider-key";
const NOW = new Date().toISOString();

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function addUser(database, input) {
  database
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, password_hash, credit_micros,
         held_micros)
       VALUES (?, ?, ?, 'active', ?, 'fixture-only', ?, 0)`,
    )
    .run(
      input.id,
      `${input.id}@load.invalid`,
      input.name,
      NOW,
      input.creditMicros ?? 0,
    );

  if ((input.creditMicros ?? 0) > 0) {
    database
      .prepare(
        `INSERT INTO credit_ledger
          (id, user_id, kind, amount_micros, balance_after_micros, note,
           created_at)
         VALUES (?, ?, 'grant', ?, ?, 'load fixture grant', ?)`,
      )
      .run(
        `ledger_${randomUUID()}`,
        input.id,
        input.creditMicros,
        input.creditMicros,
        NOW,
      );
  }

  const token = randomBytes(32).toString("base64url");

  database
    .prepare(
      `INSERT INTO customer_sessions
        (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      `sess_${randomUUID()}`,
      input.id,
      hash(token),
      NOW,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );

  return { token, cookie: `sg_session=${token}` };
}

function addKey(database, userId, name) {
  const secret = `sk-load-${randomBytes(24).toString("hex")}`;
  const keyId = `key_${randomUUID()}`;

  database
    .prepare(
      `INSERT INTO api_keys
        (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      keyId,
      userId,
      name,
      `${secret.slice(0, 8)}…${secret.slice(-4)}`,
      hash(secret),
      NOW,
    );

  return { keyId, secret };
}

/**
 * The fixture is deliberately separate from the HTTP suite catalog. It adds
 * one provider with a published subscription quota but no published RPM, so
 * the operator envelope's configured RPM is the only serving ceiling. No real
 * provider key, host, account or spend is involved.
 */
export function seedLoadFixture(database, { mockBaseUrl }) {
  database.prepare("DELETE FROM providers WHERE slug = 'load'").run();
  database.prepare("DELETE FROM models WHERE id LIKE 'load-%'").run();

  database
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES ('load', 'Load Fixture', 'openai', ?, ?, '{}', 0, 1, 0, 1,
         0, 'active', ?, ?)`,
    )
    .run(mockBaseUrl, PROVIDER_KEY_ENV, NOW, NOW);

  const insertModel = database.prepare(
    `INSERT INTO models
      (id, upstream_id, name, provider, context_window, token_weight,
       input_price_micros, output_price_micros, allow_free, supports_tools,
       supports_vision, status, sort_order, synced_at, upstream_slug, family,
       protocol, cost_source, sell_input_micros, sell_output_micros,
       price_source, in_catalog, group_slug, group_source)
     VALUES (?, ?, ?, 'Load Fixture', '128000', 1, ?, ?, ?, 0, 0, 'active',
       0, ?, 'load', 'Load Fixture', 'chat', 'manual', ?, ?, 'manual', 1, ?,
       'manual')`,
  );

  insertModel.run(
    "load-paid",
    "load-upstream-paid",
    "Load Paid Model",
    500_000,
    1_000_000,
    0,
    NOW,
    1_000_000,
    2_000_000,
    "paid",
  );
  insertModel.run(
    "load-free",
    "load-upstream-free",
    "Load Free Model",
    0,
    0,
    1,
    NOW,
    0,
    0,
    "free",
  );

  const paid = addUser(database, {
    id: "load-paid-user",
    name: "Load Paid",
    creditMicros: 10_000_000,
  });
  const free = addUser(database, {
    id: "load-free-user",
    name: "Load Free",
    creditMicros: 0,
  });
  const reserved = addUser(database, {
    id: "load-reserved-user",
    name: "Load Reserved",
    creditMicros: 500,
  });
  const crash = addUser(database, {
    id: "load-crash-user",
    name: "Load Crash",
    creditMicros: 1_000_000,
  });
  const keyChurn = addUser(database, {
    id: "load-keychurn-user",
    name: "Load Key Churn",
    creditMicros: 0,
  });

  const paidKey = addKey(database, "load-paid-user", "load paid");
  const freeKey = addKey(database, "load-free-user", "load free");
  const reservedKey = addKey(database, "load-reserved-user", "load reserved");
  const crashKey = addKey(database, "load-crash-user", "load crash");
  const churnKey = addKey(database, "load-keychurn-user", "existing churn key");

  return {
    providerKey: LOAD_PROVIDER_KEY_VALUE,
    providerKeyEnv: PROVIDER_KEY_ENV,
    paid: { ...paid, ...paidKey, userId: "load-paid-user" },
    free: { ...free, ...freeKey, userId: "load-free-user" },
    reserved: { ...reserved, ...reservedKey, userId: "load-reserved-user" },
    crash: { ...crash, ...crashKey, userId: "load-crash-user" },
    keyChurn: {
      ...keyChurn,
      ...churnKey,
      userId: "load-keychurn-user",
    },
    users: [
      "load-paid-user",
      "load-free-user",
      "load-reserved-user",
      "load-crash-user",
      "load-keychurn-user",
    ],
  };
}

export { NOW as FIXTURE_NOW };
