import { createHash, randomBytes } from "node:crypto";

import { nextUtcReset } from "../../lib/free-pool.ts";
import { check, checkEqual, request } from "./harness.mjs";

const FREE_PATH = "/models/free/mock-free";
const KEYLESS_ID = "free-allocation-keyless";
const KEYED_ID = "free-allocation-keyed";
// Customer sessions require the same 32-byte base64url shape the auth route
// issues (43 URL-safe characters); a shorter fixture string is rejected before
// the hash is compared.
const KEYLESS_TOKEN = randomBytes(32).toString("base64url");
const KEYED_TOKEN = randomBytes(32).toString("base64url");
const KEYED_SECRET = "sk-free-allocation-fixture-secret";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Seeds an account directly. The suite's signup limiter is shared by every
 * request in the process, so creating these two through `/api/auth/signup`
 * would make the check depend on how many accounts earlier modules created.
 * The fixture writes the same rows the signup route writes.
 */
async function seedCustomer(db, { id, name, token, withKey }) {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, password_hash, credit_micros,
         held_micros)
       VALUES (?, ?, ?, 'active', ?, 'fixture-only', 0, 0)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(id, `${id}@free-allocation.invalid`, name, now);

  await db
    .prepare(
      `INSERT INTO customer_sessions
        (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      `sess_${id}`,
      id,
      hash(token),
      now,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );

  if (withKey) {
    await db
      .prepare(
        `INSERT INTO api_keys
          (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES (?, ?, 'free allocation fixture', ?, ?, 'active', ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(
        `key_${id}`,
        id,
        `${KEYED_SECRET.slice(0, 8)}…${KEYED_SECRET.slice(-4)}`,
        hash(KEYED_SECRET),
        now,
      );
  }

  return `sg_session=${token}`;
}

function page(baseUrl, cookie) {
  return request(
    baseUrl,
    FREE_PATH,
    cookie ? { cookie } : undefined,
  );
}

function text(result) {
  return result.text;
}

/**
 * Five user-visible states of the free SKU page (FID-149), plus the FID-150
 * read route. The `savant` provider row is the one `getDailyTrialSummary`
 * reads; it is temporarily pointed at the suite's local key and a current
 * free-plan observation, then restored byte-for-byte in `finally`.
 */
export async function runFreeAllocationChecks({ baseUrl, db, mockBaseUrl }) {
  const saved = await db
    .prepare("SELECT * FROM providers WHERE slug = 'savant'")
    .get();

  check("the savant allocation provider row exists", Boolean(saved));

  if (!saved) return;

  const now = new Date();
  const observedAt = now.toISOString();
  const resetAt = nextUtcReset(now.getTime()).toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const columns = [
    "key_env_var",
    "base_url",
    "supports_subscription",
    "enabled",
    "status",
    "subscription_mode",
    "subscription_plan",
    "subscription_token_limit",
    "subscription_tokens_used",
    "subscription_tokens_remaining",
    "subscription_allowed",
    "subscription_expires_at",
    "quota_observed_at",
    "quota_checked_at",
    "quota_reset_at",
    "quota_unlimited",
    "quota_error",
    "runtime_lease_until",
    "synced_at",
  ];
  const restore = () =>
    db
      .prepare(
        `UPDATE providers SET ${columns
          .map((column) => `${column} = ?`)
          .join(", ")} WHERE slug = 'savant'`,
      )
      .run(...columns.map((column) => saved[column]));

  try {
    await db
      .prepare(
        `UPDATE providers
            SET key_env_var = 'HTTP_SUITE_PROVIDER_KEY',
                base_url = ?,
                supports_subscription = 1,
                enabled = 1,
                status = 'active',
                subscription_mode = 'free',
                subscription_plan = 'FREE',
                subscription_token_limit = 20000000,
                subscription_tokens_used = 100000,
                subscription_tokens_remaining = 19900000,
                subscription_allowed = 1,
                subscription_expires_at = ?,
                quota_observed_at = ?,
                quota_checked_at = ?,
                quota_reset_at = ?,
                quota_unlimited = 0,
                quota_error = NULL,
                runtime_lease_until = NULL,
                synced_at = ?
          WHERE slug = 'savant'`,
      )
      .run(
        mockBaseUrl,
        expiresAt,
        observedAt,
        observedAt,
        resetAt,
        observedAt,
      );

    const anonymous = await page(baseUrl);

    checkEqual("free SKU page is published", anonymous.status, 200);
    check(
      "signed-out free page asks for sign-in instead of a balance",
      text(anonymous).includes("Sign in to see your own allowance"),
    );
    check(
      "signed-out free page shows no balance block",
      !text(anonymous).includes("Available now"),
    );
    check(
      "signed-out free page withholds the daily pool size",
      !text(anonymous).includes("20,000,000"),
    );
    check(
      "signed-out free page withholds the allocation bps",
      !text(anonymous).includes("9,000"),
    );

    const keylessCookie = await seedCustomer(db, {
      id: KEYLESS_ID,
      name: "Free Allocation Keyless",
      token: KEYLESS_TOKEN,
      withKey: false,
    });
    const keyless = await page(baseUrl, keylessCookie);

    checkEqual("keyless free page renders", keyless.status, 200);
    check(
      "keyless free page explains the active-key requirement",
      text(keyless).includes(
        "Create an active API key to take part in today's allocation",
      ),
    );
    check(
      "keyless free page does not show an available balance",
      !text(keyless).includes("Available now"),
    );

    const keyedCookie = await seedCustomer(db, {
      id: KEYED_ID,
      name: "Free Allocation Keyed",
      token: KEYED_TOKEN,
      withKey: true,
    });
    const keyed = await page(baseUrl, keyedCookie);

    checkEqual("keyed free page renders", keyed.status, 200);
    check(
      "keyed free page shows the available balance",
      text(keyed).includes("Available now"),
    );
    check(
      "keyed free page shows the capped daily allowance",
      text(keyed).includes("100,000"),
    );
    // React SSR separates adjacent text nodes with `<!-- -->`; strip those
    // markers before matching a sentence the customer actually reads.
    const visible = text(keyed).replace(/<!--.*?-->/g, "");
    const weightLine = visible.match(/At (\d+)(?:×|\\u00d7|&times;) weight/);

    check(
      "keyed free page names the model weight",
      weightLine?.[1] === "2",
      weightLine?.[0] ?? "weight sentence missing",
    );

    const allocation = await request(baseUrl, "/api/account/allocation", {
      cookie: keyedCookie,
    });

    checkEqual("allocation read returns 200", allocation.status, 200);
    checkEqual(
      "allocation read names the active mode",
      allocation.json?.mode,
      "daily",
    );
    checkEqual(
      "allocation read returns the rendered balance",
      allocation.json?.daily?.remainingTokens,
      100000,
    );
    checkEqual(
      "daily allocation read makes no lifetime claim",
      allocation.json?.lifetime,
      null,
    );

    checkEqual(
      "signed-out allocation read is refused",
      (await request(baseUrl, "/api/account/allocation")).status,
      401,
    );

    const staleAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    await db
      .prepare(
        `UPDATE providers
            SET quota_observed_at = ?, quota_checked_at = ?
          WHERE slug = 'savant'`,
      )
      .run(staleAt, staleAt);

    const stale = await page(baseUrl, keyedCookie);

    checkEqual("stale free page still renders", stale.status, 200);
    check(
      "stale observation is reported instead of a zero balance",
      text(stale).includes(
        "Fresh upstream capacity is not available, so free-pool calls are not admitted right now",
      ),
    );
    check(
      "stale free page shows no available balance block",
      !text(stale).includes("Available now"),
    );

    const staleRead = await request(baseUrl, "/api/account/allocation", {
      cookie: keyedCookie,
    });

    checkEqual("stale allocation read still answers", staleRead.status, 200);
    checkEqual(
      "stale allocation read reports an unavailable balance",
      staleRead.json?.daily?.available,
      false,
    );
    checkEqual(
      "stale allocation read does not invent a zero",
      staleRead.json?.daily?.remainingTokens,
      null,
    );
  } finally {
    await restore();
  }
}
