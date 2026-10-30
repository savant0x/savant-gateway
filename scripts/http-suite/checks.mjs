import {
  assertCookie,
  check,
  checkEqual,
  cookieFlags,
  cookieValue,
  request,
  signWebhook,
} from "./harness.mjs";
import {
  countPaidTopups,
  countTopupLedger,
  getTopupStatus,
  readLatestErrorRow,
  readUsageRows,
  seedPendingTopup,
} from "./seed.mjs";
import { runSystemsChecks } from "./systems-checks.mjs";

const ALPHA = {
  email: "alpha.http-suite@example.test",
  name: "Alpha HTTP Suite",
  password: "alpha-http-suite-password",
};
const BETA = {
  email: "beta.http-suite@example.test",
  name: "Beta HTTP Suite",
  password: "beta-http-suite-password",
};
const PROBE = {
  email: "probe.http-suite@example.test",
  name: "Probe HTTP Suite",
  password: "probe-http-suite-password",
};

const CREDIT_TOPUP_ID = "topup_http_suite_credit";
const CREDIT_TOPUP_REF = "pending_topup_http_suite_credit";
const MISMATCH_TOPUP_ID = "topup_http_suite_mismatch";
const MISMATCH_TOPUP_REF = "pending_topup_http_suite_mismatch";

function signup(context, account, origin) {
  return request(context.baseUrl, "/api/auth/signup", {
    method: "POST",
    body: {
      email: account.email,
      name: account.name,
      password: account.password,
    },
    ...(origin ? { origin } : {}),
  });
}

function me(context, cookie) {
  return request(context.baseUrl, "/api/auth/me", {
    cookie: `sg_session=${cookie}`,
  });
}

function createKey(context, cookie, name, origin) {
  return request(context.baseUrl, "/api/account/keys", {
    method: "POST",
    cookie: `sg_session=${cookie}`,
    body: { name },
    ...(origin ? { origin } : {}),
  });
}

function buildCheckoutEvent(input) {
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    api_version: "2024-06-20",
    created: input.created,
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: input.amountTotal,
        currency: "usd",
        customer: "cus_http_suite",
        subscription: null,
        metadata: {
          topupId: input.topupId,
          userId: input.userId,
        },
      },
    },
  });
}

function sendWebhook(context, payload, timestamp) {
  return request(context.baseUrl, "/api/webhooks/stripe", {
    method: "POST",
    rawBody: payload,
    headers: {
      "stripe-signature": signWebhook(
        payload,
        context.webhookSecret,
        timestamp,
      ),
    },
  });
}

async function runAuthChecks(context) {
  const registration = await signup(context, ALPHA);

  checkEqual("signup returns 201", registration.status, 201);
  checkEqual(
    "signup returns the customer email",
    registration.json?.customer?.email,
    ALPHA.email,
  );

  const alphaId = registration.json?.customer?.id;

  check(
    "signup returns a customer id",
    typeof alphaId === "string" && alphaId.length > 0,
  );

  const alphaCookie = cookieValue(registration, "sg_session");

  check(
    "signup sets a 43-character session token",
    typeof alphaCookie === "string" && alphaCookie.length === 43,
  );
  assertCookie(registration, "sg_session", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 604_800,
    secure: true,
    path: "/",
  });

  const freshMe = await me(context, alphaCookie);

  checkEqual("me returns 200 for a fresh signup", freshMe.status, 200);
  checkEqual("me returns the signed-in email", freshMe.json?.customer?.email, ALPHA.email);
  checkEqual("me starts at zero credit", freshMe.json?.account?.creditMicros, 0);
  checkEqual("me starts with no held credit", freshMe.json?.account?.heldMicros, 0);

  const duplicate = await signup(context, ALPHA);

  checkEqual("duplicate signup returns 409", duplicate.status, 409);
  check(
    "duplicate signup explains the conflict",
    String(duplicate.json?.error ?? "").includes("already exists"),
    duplicate.text,
  );

  const foreignSignup = await signup(
    context,
    { ...ALPHA, email: "foreign.http-suite@example.test" },
    "http://evil.example",
  );

  checkEqual("foreign-origin signup returns 403", foreignSignup.status, 403);

  const keyResponse = await createKey(context, alphaCookie, "alpha-http-key");

  checkEqual("alpha key create returns 201", keyResponse.status, 201);

  const alphaKeyId = keyResponse.json?.key?.id;
  const alphaSecret = keyResponse.json?.secret;

  check(
    "alpha key create returns a key id",
    typeof alphaKeyId === "string" && alphaKeyId.startsWith("key_"),
  );
  check(
    "alpha key create returns a usable secret",
    typeof alphaSecret === "string" && alphaSecret.length >= 32,
  );

  const foreignKey = await createKey(
    context,
    alphaCookie,
    "foreign-http-key",
    "http://evil.example",
  );

  checkEqual("foreign-origin key create returns 403", foreignKey.status, 403);

  const logout = await request(context.baseUrl, "/api/auth/logout", {
    method: "POST",
    cookie: `sg_session=${alphaCookie}`,
  });

  checkEqual("logout returns 200", logout.status, 200);

  const cleared = cookieFlags(logout, "sg_session");

  check(
    "logout clears the session cookie",
    cleared.startsWith("sg_session=") && cleared.includes("max-age=0"),
    cleared,
  );

  const afterLogout = await me(context, alphaCookie);

  checkEqual("me rejects the revoked session", afterLogout.status, 401);

  const login = await request(context.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: ALPHA.email, password: ALPHA.password },
  });

  checkEqual("login returns 200", login.status, 200);

  const sessionCookie = cookieValue(login, "sg_session");

  check(
    "login mints a new session token",
    typeof sessionCookie === "string" && sessionCookie !== alphaCookie,
  );
  assertCookie(login, "sg_session", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 604_800,
    secure: true,
    path: "/",
  });

  const afterLogin = await me(context, sessionCookie);

  checkEqual("me returns 200 after login", afterLogin.status, 200);

  return {
    id: alphaId,
    email: ALPHA.email,
    cookie: sessionCookie,
    keyId: alphaKeyId,
    secret: alphaSecret,
  };
}

async function runBetaChecks(context) {
  const registration = await signup(context, BETA);

  checkEqual("beta signup returns 201", registration.status, 201);

  const betaCookie = cookieValue(registration, "sg_session");

  check("beta signup sets a session token", typeof betaCookie === "string");

  const keyResponse = await createKey(context, betaCookie, "beta-http-key");

  checkEqual("beta key create returns 201", keyResponse.status, 201);

  return {
    id: registration.json?.customer?.id,
    email: BETA.email,
    cookie: betaCookie,
    keyId: keyResponse.json?.key?.id,
    secret: keyResponse.json?.secret,
  };
}

async function runKeyIsolationChecks(context, alpha, beta) {
  const betaKeys = await request(context.baseUrl, "/api/account/keys", {
    cookie: `sg_session=${beta.cookie}`,
  });

  checkEqual("beta key list returns 200", betaKeys.status, 200);
  check(
    "beta key list omits alpha's key",
    Array.isArray(betaKeys.json?.keys) &&
      betaKeys.json.keys.every((key) => key.id !== alpha.keyId),
  );
  check(
    "beta key list contains beta's key",
    betaKeys.json?.keys?.some((key) => key.id === beta.keyId),
  );

  const crossDelete = await request(
    context.baseUrl,
    `/api/account/keys/${alpha.keyId}`,
    { method: "DELETE", cookie: `sg_session=${beta.cookie}` },
  );

  checkEqual("cross-account key delete returns 404", crossDelete.status, 404);

  const alphaKeys = await request(context.baseUrl, "/api/account/keys", {
    cookie: `sg_session=${alpha.cookie}`,
  });

  checkEqual("alpha key list returns 200", alphaKeys.status, 200);
  check(
    "alpha key survives the cross-account delete",
    alphaKeys.json?.keys?.some(
      (key) => key.id === alpha.keyId && key.status === "active",
    ),
  );
}

async function runWebhookChecks(context, alpha) {
  seedPendingTopup(context.db, {
    id: CREDIT_TOPUP_ID,
    userId: alpha.id,
    amountMicros: 50_000_000,
    providerRef: CREDIT_TOPUP_REF,
  });

  const before = await me(context, alpha.cookie);

  checkEqual("webhook test starts at zero credit", before.json?.account?.creditMicros, 0);

  const created = Math.floor(Date.now() / 1000);
  const payload = buildCheckoutEvent({
    eventId: "evt_http_suite_credit",
    topupId: CREDIT_TOPUP_ID,
    userId: alpha.id,
    amountTotal: 5000,
    sessionId: "cs_test_http_suite_credit",
    created,
  });
  const delivered = await sendWebhook(context, payload, created);

  checkEqual("signed webhook returns 200", delivered.status, 200);
  checkEqual("signed webhook credits the top-up", delivered.json?.credited, true);
  checkEqual("signed webhook is not a replay", delivered.json?.replay, undefined);

  const credited = await me(context, alpha.cookie);

  checkEqual(
    "webhook credits exactly the top-up amount",
    credited.json?.account?.creditMicros,
    50_000_000,
  );
  checkEqual("webhook leaves no held credit", credited.json?.account?.heldMicros, 0);
  checkEqual("webhook marks one top-up paid", countPaidTopups(context.db, alpha.id), 1);
  checkEqual("webhook writes one ledger row", countTopupLedger(context.db, alpha.id), 1);

  const replay = await sendWebhook(context, payload, created);

  checkEqual("replayed webhook returns 200", replay.status, 200);
  checkEqual("replayed webhook is identified as a replay", replay.json?.replay, true);
  checkEqual(
    "replay does not credit again",
    (await me(context, alpha.cookie)).json?.account?.creditMicros,
    50_000_000,
  );
  checkEqual("replay does not duplicate the top-up", countPaidTopups(context.db, alpha.id), 1);
  checkEqual("replay does not duplicate the ledger row", countTopupLedger(context.db, alpha.id), 1);

  const invalid = await request(context.baseUrl, "/api/webhooks/stripe", {
    method: "POST",
    rawBody: payload,
    headers: {
      "stripe-signature": `t=${created},v1=${"0".repeat(64)}`,
    },
  });

  checkEqual("invalid signature returns 400", invalid.status, 400);
  check(
    "invalid signature is rejected",
    String(invalid.json?.error ?? "").includes("Invalid signature"),
  );
  checkEqual(
    "invalid signature does not change the balance",
    (await me(context, alpha.cookie)).json?.account?.creditMicros,
    50_000_000,
  );

  seedPendingTopup(context.db, {
    id: MISMATCH_TOPUP_ID,
    userId: alpha.id,
    amountMicros: 10_000_000,
    providerRef: MISMATCH_TOPUP_REF,
  });

  const mismatchCreated = created + 1;
  const mismatchPayload = buildCheckoutEvent({
    eventId: "evt_http_suite_mismatch",
    topupId: MISMATCH_TOPUP_ID,
    userId: alpha.id,
    amountTotal: 1,
    sessionId: "cs_test_http_suite_mismatch",
    created: mismatchCreated,
  });
  const mismatch = await sendWebhook(context, mismatchPayload, mismatchCreated);

  checkEqual("amount-mismatch webhook returns 200", mismatch.status, 200);
  checkEqual("amount-mismatch webhook does not credit", mismatch.json?.credited, false);
  checkEqual(
    "amount-mismatch top-up stays pending",
    getTopupStatus(context.db, MISMATCH_TOPUP_ID),
    "pending",
  );
  checkEqual(
    "amount-mismatch leaves the balance unchanged",
    (await me(context, alpha.cookie)).json?.account?.creditMicros,
    50_000_000,
  );
}

async function runSettlementChecks(context, alpha, beta) {
  context.mock.reset();

  const call = await request(context.baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${alpha.secret}` },
    body: {
      model: "mock-paid",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 64,
    },
  });

  checkEqual("paid call returns 200", call.status, 200);
  checkEqual(
    "paid call returns the upstream completion",
    call.json?.choices?.[0]?.message?.content,
    "http-suite-ok",
  );
  checkEqual("paid call reports prompt usage", call.json?.usage?.prompt_tokens, 100);
  checkEqual(
    "paid call reports completion usage",
    call.json?.usage?.completion_tokens,
    50,
  );
  checkEqual(
    "paid call forwards the provider key",
    context.mock.state.lastRequest?.authorization,
    `Bearer ${context.providerKey}`,
  );
  checkEqual(
    "paid call translates the public model id",
    context.mock.state.lastRequest?.body?.model,
    "mock-upstream-model",
  );
  checkEqual(
    "paid call keeps the requested output budget",
    context.mock.state.lastRequest?.body?.max_tokens,
    64,
  );

  const after = await me(context, alpha.cookie);

  checkEqual(
    "paid call debits the exact sell price",
    after.json?.account?.creditMicros,
    49_999_800,
  );
  checkEqual("paid call releases the hold", after.json?.account?.heldMicros, 0);

  const rows = readUsageRows(context.db, alpha.id);

  checkEqual("paid call writes one usage row", rows.length, 1);

  const usage = rows[0] ?? {};

  checkEqual("usage row records the public model", usage.model_id, "mock-paid");
  checkEqual("usage row records prompt tokens", usage.input_tokens, 100);
  checkEqual("usage row records completion tokens", usage.output_tokens, 50);
  checkEqual("usage row records the charge", usage.charged_micros, 200);
  checkEqual("usage row records the upstream cost", usage.cost_micros, 100);
  checkEqual("usage row records success", usage.status, "ok");
  checkEqual("usage row bills credit", usage.billing_source, "credit");

  const betaCall = await request(context.baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${beta.secret}` },
    body: {
      model: "mock-paid",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 64,
    },
  });

  checkEqual("unfunded paid call returns 402", betaCall.status, 402);
  checkEqual(
    "unfunded paid call reports insufficient_quota",
    betaCall.json?.error?.type,
    "insufficient_quota",
  );
  checkEqual("unfunded call does not reach the provider", context.mock.state.calls, 1);
  checkEqual("unfunded call writes no usage row", readUsageRows(context.db, beta.id).length, 0);
  checkEqual(
    "unfunded balance stays zero",
    (await me(context, beta.cookie)).json?.account?.creditMicros,
    0,
  );
}

async function runAdminChecks(context) {
  const anonymous = await request(context.baseUrl, "/admin");

  checkEqual("anonymous admin page redirects", anonymous.status, 307);
  check(
    "anonymous admin page redirects to login",
    String(anonymous.headers.get("location") ?? "").includes("/admin/login"),
  );

  const wrong = await request(context.baseUrl, "/api/admin/session", {
    method: "POST",
    body: { password: "wrong-http-suite-password" },
  });

  checkEqual("wrong admin password returns 401", wrong.status, 401);

  const foreign = await request(context.baseUrl, "/api/admin/session", {
    method: "POST",
    origin: "http://evil.example",
    body: { password: context.adminPassword },
  });

  checkEqual("foreign-origin admin login returns 403", foreign.status, 403);

  const login = await request(context.baseUrl, "/api/admin/session", {
    method: "POST",
    body: { password: context.adminPassword },
  });

  checkEqual("admin login returns 200", login.status, 200);
  checkEqual("admin login returns ok", login.json?.ok, true);

  const adminCookie = cookieValue(login, "sg_admin");

  check(
    "admin login sets a session token",
    typeof adminCookie === "string" && adminCookie.length > 0,
  );
  assertCookie(login, "sg_admin", {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 28_800,
    secure: true,
    path: "/",
  });

  const customers = await request(context.baseUrl, "/admin/customers", {
    cookie: `sg_admin=${adminCookie}`,
  });

  checkEqual("authenticated admin page returns 200", customers.status, 200);
  check(
    "admin customer page lists the signed-up account",
    customers.text.includes(ALPHA.email),
  );
  check(
    "admin customer page renders its heading",
    customers.text.includes("Who holds credit"),
  );

  return adminCookie;
}

async function runAvailabilityChecks(context) {
  const health = await request(context.baseUrl, "/api/health");
  const ready = await request(context.baseUrl, "/api/ready");

  checkEqual("liveness responds on production", health.status, 200);
  checkEqual("liveness claims only that the process can answer", health.json?.status, "alive");
  check(
    "liveness is not cached",
    (health.headers.get("cache-control") ?? "").includes("no-store"),
  );

  checkEqual("readiness responds on production", ready.status, 200);
  checkEqual("readiness accepts the suite's validated configuration", ready.json?.status, "ready");
  checkEqual("readiness marks the opted-in runtime as disposable", ready.json?.mode, "disposable");
  checkEqual("readiness reports its storage probe as passing", ready.json?.checks?.storage, "ok");
  check(
    "readiness is not cached",
    (ready.headers.get("cache-control") ?? "").includes("no-store"),
  );
}

async function runDegradeChecks(context) {
  const page = await request(context.baseUrl, "/models");

  checkEqual("baseline headers reach a customer page", page.status, 200);
  checkEqual(
    "responses tell browsers not to sniff content types",
    page.headers.get("x-content-type-options"),
    "nosniff",
  );
  checkEqual(
    "responses refuse hostile framing",
    page.headers.get("x-frame-options"),
    "DENY",
  );
  check(
    "responses carry a referrer policy",
    typeof page.headers.get("referrer-policy") === "string" &&
      page.headers.get("referrer-policy").length > 0,
  );

  // The truthful-negative readiness probe: when durable storage loses a
  // required table, readiness must fail closed instead of staying green. The
  // database is disposable at this point — this check runs last.
  context.db.exec("DROP TABLE settings");

  const degraded = await request(context.baseUrl, "/api/ready");

  checkEqual("readiness fails closed when storage loses a required table", degraded.status, 503);
  checkEqual("readiness names storage as the unavailable check", degraded.json?.checks?.storage, "unavailable");
  check(
    "degraded readiness still refuses to cache",
    (degraded.headers.get("cache-control") ?? "").includes("no-store"),
  );
}

async function runSecurityChecks(context, alpha, beta, adminCookie) {
  const devModels = await request(context.baseUrl, "/api/models");

  checkEqual(
    "production console rejects the loopback dev bypass",
    devModels.status,
    403,
  );

  const devKeys = await request(context.baseUrl, "/api/keys");

  checkEqual("production key console requires an admin session", devKeys.status, 403);

  const anonymousAdmin = await request(context.baseUrl, "/api/admin/pricing");

  checkEqual("anonymous admin API returns 401", anonymousAdmin.status, 401);

  const forwardedAdmin = await request(context.baseUrl, "/api/admin/pricing", {
    headers: {
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
      forwarded: "host=evil.example;proto=https",
    },
  });

  checkEqual(
    "spoofed forwarded headers do not authorize the admin API",
    forwardedAdmin.status,
    401,
  );

  const foreignAdmin = await request(context.baseUrl, "/api/admin/pricing", {
    cookie: `sg_admin=${adminCookie}`,
    origin: "http://evil.example",
  });

  checkEqual(
    "foreign-origin admin read is rejected even with a session",
    foreignAdmin.status,
    403,
  );

  const throwaway = await createKey(context, beta.cookie, "beta-revoke-probe");

  checkEqual("revocation probe key is created", throwaway.status, 201);

  const revokedDelete = await request(
    context.baseUrl,
    `/api/account/keys/${throwaway.json?.key?.id}`,
    { method: "DELETE", cookie: `sg_session=${beta.cookie}` },
  );

  checkEqual("revocation probe key is revoked", revokedDelete.status, 200);

  const revokedCall = await request(context.baseUrl, "/v1/models", {
    headers: { authorization: `Bearer ${throwaway.json?.secret}` },
  });

  checkEqual("a revoked key is rejected", revokedCall.status, 401);

  context.db
    .prepare("UPDATE users SET status = 'suspended' WHERE id = ?")
    .run(beta.id);

  try {
    const suspendedMe = await me(context, beta.cookie);
    const suspendedCall = await request(context.baseUrl, "/v1/models", {
      headers: { authorization: `Bearer ${beta.secret}` },
    });

    checkEqual("a suspended account loses its session", suspendedMe.status, 401);
    checkEqual("a suspended account cannot use its key", suspendedCall.status, 401);
  } finally {
    context.db
      .prepare("UPDATE users SET status = 'active' WHERE id = ?")
      .run(beta.id);
  }

  checkEqual(
    "the session recovers when the account is active again",
    (await me(context, beta.cookie)).status,
    200,
  );

  const probeSignup = await signup(context, PROBE);

  checkEqual("probe account signs up", probeSignup.status, 201);

  // Rotate the forwarded address so the per-address bucket never fills. The
  // per-account ceiling must still stop the eleventh guess.
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const guess = await request(context.baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${attempt}` },
      body: { email: PROBE.email, password: "wrong-probe-password" },
    });

    checkEqual(`rotating-address login guess ${attempt} returns 401`, guess.status, 401);
  }

  const blockedGuess = await request(context.baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.250" },
    body: { email: PROBE.email, password: "wrong-probe-password" },
  });

  checkEqual(
    "a rotated address cannot extend the per-account login ceiling",
    blockedGuess.status,
    429,
  );
  check(
    "the blocked login reports a retry delay",
    typeof blockedGuess.headers.get("retry-after") === "string",
  );

  const correctWhileBlocked = await request(context.baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.251" },
    body: { email: PROBE.email, password: PROBE.password },
  });

  checkEqual(
    "the blocked account cannot be probed with the correct password",
    correctWhileBlocked.status,
    429,
  );

  context.mock.reset();

  const leak = await request(context.baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${alpha.secret}` },
    body: {
      model: "mock-paid",
      messages: [{ role: "user", content: "leak probe" }],
      max_tokens: 16,
    },
  });

  checkEqual("an upstream failure returns 502", leak.status, 502);
  check(
    "the failure body omits the provider key",
    !leak.text.includes(context.providerKey),
    leak.text,
  );

  const failed = readLatestErrorRow(context.db, alpha.id);
  const failedError = String(failed?.error ?? "");

  checkEqual("the failed call records an error row", failed?.status, "error");
  check(
    "the durable usage error omits the provider key",
    !failedError.includes(context.providerKey),
    failedError,
  );
  check(
    "the durable usage error is redacted",
    failedError.includes("[redacted]"),
    failedError,
  );

  context.mock.reset();

  const redirected = await request(context.baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${alpha.secret}` },
    body: {
      model: "mock-paid",
      messages: [{ role: "user", content: "redirect probe" }],
      max_tokens: 16,
    },
  });

  checkEqual("a redirecting provider is reported as a failure", redirected.status, 502);
  checkEqual(
    "a provider redirect is not followed with the credential",
    context.mock.state.redirected,
    false,
  );
}

async function runCatalogIntegrityChecks(context, adminCookie) {
  const cookie = `sg_admin=${adminCookie}`;
  const rows = () =>
    context.db
      .prepare(
        `SELECT id, upstream_id, in_catalog, synced_at FROM models
         WHERE upstream_slug = 'mock' ORDER BY id`,
      )
      .all();
  const sync = () =>
    request(context.baseUrl, "/api/admin/providers/mock/sync", {
      method: "POST",
      cookie,
    });

  const before = rows();

  checkEqual("the seeded provider catalog has one row", before.length, 1);
  checkEqual("the seeded row is published", before[0].in_catalog, 1);

  // A 200 that is not a model list must fail the sync without touching rows.
  context.mock.state.catalog.mode = "malformed";
  const malformed = await sync();

  checkEqual("a 200 error object is a sync failure", malformed.status, 502);
  checkEqual("a 200 error object does not delist the catalog", rows().length, 1);
  checkEqual(
    "a 200 error object leaves the row published",
    rows()[0].in_catalog,
    1,
  );
  checkEqual(
    "a 200 error object does not advance the sync timestamp",
    rows()[0].synced_at,
    before[0].synced_at,
  );

  context.mock.state.catalog.mode = "html";
  const html = await sync();

  checkEqual("an HTML catalog page is a sync failure", html.status, 502);
  checkEqual("an HTML catalog page does not delist the catalog", rows().length, 1);
  checkEqual(
    "an HTML catalog page leaves the row published",
    rows()[0].in_catalog,
    1,
  );

  // The healthy path still imports: the guard must reject bad shapes, not sync.
  context.mock.state.catalog.mode = "ok";
  const ok = await sync();

  checkEqual("a valid catalog sync succeeds", ok.status, 200);
  checkEqual("a valid catalog sync imports the model", ok.json?.imported, 1);
  check(
    "the catalog sync sent the provider credential",
    context.mock.state.catalog.requests >= 3,
    String(context.mock.state.catalog.requests),
  );

  const published = rows().filter((row) => row.in_catalog === 1);

  checkEqual("the sync publishes exactly the source model", published.length, 1);
  checkEqual(
    "the synced row carries the upstream identity",
    published[0]?.upstream_id,
    "sync-catalog-model",
  );

  const absent = rows().find((row) => row.id === "mock-paid");

  check(
    "a model absent from the source is delisted, not deleted",
    absent && absent.in_catalog === 0,
    JSON.stringify(absent),
  );

  const duplicate = context.db
    .prepare(
      `SELECT COUNT(*) AS total FROM models
       WHERE upstream_slug = 'mock' AND in_catalog = 1`,
    )
    .get();

  checkEqual("a sync never publishes duplicate rows", duplicate.total, 1);
}

async function runSupportChecks(context, alpha, beta, adminCookie) {
  const anonymous = await request(context.baseUrl, "/api/account/support");

  checkEqual("support requires an account", anonymous.status, 401);

  const foreign = await request(context.baseUrl, "/api/account/support", {
    method: "POST",
    cookie: `sg_session=${alpha.cookie}`,
    origin: "http://evil.example",
    body: {
      kind: "support",
      subject: "Should be rejected",
      message: "A cross-origin request must not create a queue entry.",
    },
  });

  checkEqual("a foreign-origin support request is rejected", foreign.status, 403);

  const invalid = await request(context.baseUrl, "/api/account/support", {
    method: "POST",
    cookie: `sg_session=${alpha.cookie}`,
    body: { kind: "support", subject: "hi", message: "too short" },
  });

  checkEqual("an invalid support request is rejected", invalid.status, 400);
  check(
    "the rejection names the field rule",
    String(invalid.json?.error ?? "").includes("Subject"),
    invalid.text,
  );

  const created = await request(context.baseUrl, "/api/account/support", {
    method: "POST",
    cookie: `sg_session=${alpha.cookie}`,
    body: {
      kind: "privacy",
      subject: "HTTP suite privacy request",
      message: "Prove the authenticated queue stores and resolves requests.",
    },
  });

  checkEqual("a signed-in support request is recorded", created.status, 201);

  const requestId = created.json?.request?.id;

  check(
    "the recorded request returns its id",
    typeof requestId === "string" && requestId.startsWith("support_"),
    created.text,
  );
  checkEqual("a new request starts open", created.json?.request?.status, "open");

  const own = await request(context.baseUrl, "/api/account/support", {
    cookie: `sg_session=${alpha.cookie}`,
  });

  check(
    "the customer sees their own request",
    Array.isArray(own.json?.requests) &&
      own.json.requests.some((row) => row.id === requestId),
  );

  const other = await request(context.baseUrl, "/api/account/support", {
    cookie: `sg_session=${beta.cookie}`,
  });

  check(
    "another account cannot see the request",
    Array.isArray(other.json?.requests) &&
      other.json.requests.every((row) => row.id !== requestId),
  );

  const queue = await request(context.baseUrl, "/api/admin/support", {
    cookie: `sg_admin=${adminCookie}`,
  });

  checkEqual("the operator queue answers", queue.status, 200);
  check(
    "the operator queue contains the request with its customer",
    queue.json?.requests?.some(
      (row) => row.id === requestId && row.customerEmail === alpha.email,
    ),
    queue.text,
  );
  check(
    "the operator sees an open count",
    typeof queue.json?.open === "number" && queue.json.open >= 1,
  );

  const resolved = await request(context.baseUrl, "/api/admin/support", {
    method: "PATCH",
    cookie: `sg_admin=${adminCookie}`,
    body: { id: requestId, note: "Reviewed and answered in the suite." },
  });

  checkEqual("the operator can resolve a request", resolved.status, 200);
  checkEqual(
    "resolving marks the request resolved",
    resolved.json?.request?.status,
    "resolved",
  );
  checkEqual(
    "the resolution note is stored",
    resolved.json?.request?.resolutionNote,
    "Reviewed and answered in the suite.",
  );

  const after = await request(context.baseUrl, "/api/account/support", {
    cookie: `sg_session=${alpha.cookie}`,
  });
  const stored = after.json?.requests?.find((row) => row.id === requestId);

  checkEqual("the customer sees the resolved state", stored?.status, "resolved");
  checkEqual(
    "the customer sees the operator note",
    stored?.resolutionNote,
    "Reviewed and answered in the suite.",
  );
}

function h1Count(html) {
  return (html.match(/<h1\b/gi) ?? []).length;
}

async function runCustomerExperienceChecks(context, alpha, beta) {
  const publicPages = ["/", "/models", "/plans", "/docs", "/support"];

  for (const path of publicPages) {
    const page = await request(context.baseUrl, path);

    checkEqual(`${path} renders for an anonymous visitor`, page.status, 200);
    check(
      `${path} declares its language`,
      page.text.includes('<html lang="en"'),
      page.text.slice(0, 200),
    );
    check(
      `${path} offers a skip link`,
      page.text.includes("Skip to content"),
    );
    checkEqual(`${path} has exactly one top-level heading`, h1Count(page.text), 1);
  }

  const plans = await request(context.baseUrl, "/plans");

  check(
    "an unavailable plan catalog does not promise a payment flow",
    !plans.text.includes("Payment is completed on Stripe"),
    plans.text,
  );
  check(
    "an unavailable plan catalog says so",
    plans.text.includes("Plans are not available yet"),
  );
  check(
    "the footer links to the support page",
    plans.text.includes('href="/support"'),
  );

  const support = await request(context.baseUrl, "/support");

  checkEqual("the support page renders", support.status, 200);
  check(
    "the support page explains that requests are account-bound",
    support.text.includes("signed-in account") &&
      support.text.includes("no public contact form"),
    support.text.slice(0, 400),
  );
  check(
    "the support page does not invent a contact address",
    !/mailto:|\bsupport@/.test(support.text),
  );

  const docs = await request(context.baseUrl, "/docs");

  check(
    "the API reference documents the implemented chat endpoint",
    docs.text.includes("/v1/chat/completions"),
  );
  check(
    "the API reference does not advertise an unimplemented Messages API",
    !docs.text.includes("/v1/messages"),
  );
  check(
    "the API reference does not advertise an unimplemented Responses API",
    !docs.text.includes("/v1/responses"),
  );

  // Beta never received a comp, so this is the no-plan state.
  const account = await request(context.baseUrl, "/account", {
    cookie: `sg_session=${beta.cookie}`,
  });

  checkEqual("a signed-in account page renders", account.status, 200);
  check(
    "the account page shows the credit balance",
    account.text.includes("Available credit"),
  );
  check(
    "the account page states that no plan is attached",
    account.text.includes("No plan is attached to this account"),
  );
  check(
    "the account page does not link to a plan catalog that cannot sell",
    !account.text.includes("Compare plans"),
  );
  check(
    "the account page explains that plans are not on sale",
    account.text.includes("Plans are not on sale during this launch"),
  );

  const paid = await request(context.baseUrl, "/account?topup=success", {
    cookie: `sg_session=${alpha.cookie}`,
  });

  checkEqual("a payment return renders the account", paid.status, 200);
  check(
    "a payment return attributes credit to the signed webhook",
    paid.text.includes("signed") && paid.text.includes("webhook"),
  );
  check(
    "a payment return does not claim the balance already moved",
    !paid.text.includes("Credit has been added"),
  );

  const subscribed = await request(
    context.baseUrl,
    "/account?subscription=success",
    { cookie: `sg_session=${alpha.cookie}` },
  );

  check(
    "a subscription return attributes access to the invoice webhook",
    subscribed.text.includes("signed invoice webhook"),
  );
  check(
    "a cancelled subscription return says nothing was charged",
    (await request(context.baseUrl, "/account?subscription=cancelled", {
      cookie: `sg_session=${alpha.cookie}`,
    })).text.includes("Nothing was charged"),
  );
}

async function runBenchmarkIntegrityChecks(context, adminCookie) {
  const cookie = `sg_admin=${adminCookie}`;
  const sync = () =>
    request(context.baseUrl, "/api/admin/benchmarks", {
      method: "POST",
      cookie,
      body: { force: true },
    });
  const status = () =>
    request(context.baseUrl, "/api/admin/benchmarks", { cookie });
  const row = () =>
    context.db
      .prepare(
        `SELECT model_id, source_slug, index_version, measured_at, stale,
                intelligence_index
         FROM model_benchmarks
         WHERE source = 'artificial_analysis'
           AND source_slug = 'sync-catalog-model'`,
      )
      .get();

  // Page renders may have started a background refresh against the default
  // unavailable fixture; wait briefly so it does not hold the writer lease.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await status();

    if (!current.json?.running) break;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Two pages: the second page is only read when pagination is honoured.
  context.mock.state.benchmarks.mode = "paginated";
  const first = await sync();

  checkEqual("a paginated benchmark sync answers", first.status, 200);
  checkEqual("a paginated benchmark sync succeeds", first.json?.status, "ok");
  check(
    "the sync follows the second page",
    context.mock.state.benchmarks.pages.includes(2),
    JSON.stringify(context.mock.state.benchmarks.pages),
  );
  check(
    "pagination does not truncate the candidate count",
    (first.json?.candidates ?? 0) > 200,
    String(first.json?.candidates),
  );
  checkEqual("the catalog model is matched", first.json?.matched, 1);
  check("the matched measurement is stored", Boolean(row()));
  checkEqual(
    "the stored measurement keeps its source index version",
    row()?.index_version,
    "5.0",
  );
  checkEqual(
    "the stored measurement keeps its own observation date",
    row()?.measured_at,
    "2026-10-21T00:00:00.000Z",
  );
  checkEqual("a measured row starts fresh", row()?.stale, 0);

  // A collapsed payload would mark every row stale; it must be refused instead.
  context.mock.state.benchmarks.mode = "collapse";
  const collapse = await sync();

  checkEqual("a collapsed benchmark payload fails", collapse.json?.status, "failed");
  check(
    "the refusal names the shrink",
    String(collapse.json?.error ?? "").includes("shrank"),
    collapse.text,
  );
  checkEqual("a refused payload leaves the measurement fresh", row()?.stale, 0);

  const attempt = await status();

  check(
    "the failed attempt is visible to the operator",
    String(attempt.json?.lastError ?? "").includes("shrank"),
    attempt.text,
  );

  // A later good sync without the model must not erase or re-date its numbers.
  context.mock.state.benchmarks.mode = "renamed";
  const renamed = await sync();

  checkEqual("a sync without the model still succeeds", renamed.json?.status, "ok");
  checkEqual(
    "a dropped model keeps its own index version",
    row()?.index_version,
    "5.0",
  );
  checkEqual(
    "a dropped model keeps its own observation date",
    row()?.measured_at,
    "2026-10-21T00:00:00.000Z",
  );
  checkEqual("a dropped model is marked stale, not deleted", row()?.stale, 1);

  // A spent daily window is refused without another upstream request.
  context.mock.state.benchmarks.quotaRemaining = 0;
  const spent = await sync();

  checkEqual("the empty quota window is recorded", spent.json?.quotaRemaining, 0);

  const requestsBefore = context.mock.state.benchmarks.requests;
  const refused = await sync();

  checkEqual("a spent daily window refuses another sync", refused.json?.status, "quota_exhausted");
  checkEqual(
    "a refused window makes no upstream request",
    context.mock.state.benchmarks.requests,
    requestsBefore,
  );
}

async function runPlanSalesChecks(context, alpha, adminCookie) {
  const adminHeaders = { cookie: `sg_admin=${adminCookie}` };
  const planBody = {
    slug: "http-suite-plan",
    name: "HTTP Suite Plan",
    description: "Launch sales policy probe",
    status: "draft",
    priceUsd: 5,
    interval: "month",
    includedWeightedTokens: 100_000,
    overageMode: "block",
    overageMarkupBps: 0,
    groups: [],
    modelIds: ["mock-paid"],
  };

  const created = await request(context.baseUrl, "/api/admin/plans", {
    method: "POST",
    ...adminHeaders,
    body: planBody,
  });

  checkEqual("draft plans stay authorable while sales are off", created.status, 200);

  const planId = created.json?.plan?.id;

  check(
    "draft plan creation returns an id",
    typeof planId === "string" && planId.startsWith("plan_"),
    created.text,
  );

  const publish = await request(context.baseUrl, "/api/admin/plans", {
    method: "PATCH",
    ...adminHeaders,
    body: { ...planBody, id: planId, status: "active" },
  });

  checkEqual("publishing a plan is refused while sales are off", publish.status, 409);
  check(
    "publishing refusal names the launch policy",
    String(publish.json?.error ?? "").includes("sales are disabled"),
    publish.text,
  );

  // A plan published before the policy existed must not become purchasable by
  // its stored status alone.
  context.db
    .prepare("UPDATE plans SET status = 'active' WHERE id = ?")
    .run(planId);

  const catalog = await request(context.baseUrl, "/api/plans");

  checkEqual("public plan catalog answers while sales are off", catalog.status, 200);
  checkEqual(
    "public plan catalog publishes no active plan while sales are off",
    catalog.json?.plans?.length,
    0,
  );

  const plansPage = await request(context.baseUrl, "/plans");

  checkEqual("plans page renders while sales are off", plansPage.status, 200);
  check(
    "plans page states that plans are unavailable",
    plansPage.text.includes("Plans are not available yet"),
  );
  check(
    "plans page does not render the unpublished plan",
    !plansPage.text.includes("HTTP Suite Plan"),
  );

  const crafted = await request(context.baseUrl, "/api/account/subscription", {
    method: "POST",
    cookie: `sg_session=${alpha.cookie}`,
    body: { planSlug: planBody.slug },
  });

  checkEqual("crafted subscription checkout is refused while sales are off", crafted.status, 403);
  checkEqual(
    "checkout refusal names the sales policy, not Stripe",
    crafted.headers.get("x-reason"),
    "plan_sales_disabled",
  );
  check(
    "checkout refusal happens before payment readiness",
    !crafted.text.toLowerCase().includes("stripe"),
    crafted.text,
  );

  // A checkout that was already in flight when sales were switched off must
  // still be completable: its signed invoice is an existing obligation, not a
  // new sale. It is activated through the webhook, never the public route.
  const inflightUser = "user_http_suite_inflight";
  const inflightSub = "sub_http_suite_inflight";
  const inflightPlan = context.db
    .prepare("SELECT * FROM plans WHERE id = ?")
    .get(planId);
  const inflightNow = new Date();
  const inflightStart = inflightNow.toISOString();
  const inflightEnd = new Date(
    inflightNow.getTime() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  context.db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES (?, ?, 'Inflight HTTP Suite', 'active', ?)`,
    )
    .run(inflightUser, `${inflightUser}@example.test`, inflightStart);
  context.db
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, stripe_customer_id,
         stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
         currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
         overage_mode_snapshot, overage_markup_bps_snapshot,
         current_period_start, current_period_end, cancel_at_period_end,
         created_at, updated_at)
       VALUES (?, ?, ?, 'incomplete', 'stripe', 'cus_http_inflight',
         'sub_http_inflight', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      inflightSub,
      inflightUser,
      planId,
      inflightPlan.name,
      inflightPlan.price_micros,
      inflightPlan.currency,
      inflightPlan.interval,
      inflightPlan.included_weighted_tokens,
      inflightPlan.overage_mode,
      inflightPlan.overage_markup_bps,
      inflightStart,
      inflightEnd,
      inflightStart,
      inflightStart,
    );
  context.db
    .prepare(
      `INSERT INTO subscription_models (subscription_id, model_id)
       VALUES (?, 'mock-paid')`,
    )
    .run(inflightSub);

  const inflightPaidAt = Math.floor(inflightNow.getTime() / 1000);
  const inflightEvent = JSON.stringify({
    id: "evt_http_suite_inflight_paid",
    object: "event",
    api_version: "2024-06-20",
    created: inflightPaidAt,
    type: "invoice.paid",
    data: {
      object: {
        id: "in_http_suite_inflight",
        object: "invoice",
        amount_paid: 500,
        currency: "usd",
        status: "paid",
        status_transitions: { paid_at: inflightPaidAt },
        subscription: "sub_http_inflight",
        customer: "cus_http_inflight",
        lines: {
          data: [
            {
              period: {
                start: inflightPaidAt,
                end: inflightPaidAt + 30 * 24 * 60 * 60,
              },
            },
          ],
        },
      },
    },
  });
  const inflight = await sendWebhook(context, inflightEvent, inflightPaidAt);

  checkEqual("a pre-existing checkout invoice is still accepted", inflight.status, 200);
  checkEqual(
    "the in-flight payment activates while sales are off",
    inflight.json?.activated,
    true,
  );
  checkEqual(
    "the activated subscription is active while sales are off",
    context.db
      .prepare("SELECT status FROM subscriptions WHERE id = ?")
      .get(inflightSub)?.status,
    "active",
  );

  const grant = await request(context.baseUrl, "/api/admin/subscriptions", {
    method: "POST",
    ...adminHeaders,
    body: { action: "grant", userId: alpha.id, planId },
  });

  checkEqual("manual comps still work while sales are off", grant.status, 200);
  checkEqual(
    "a comped subscription is active while sales are off",
    grant.json?.subscription?.status,
    "active",
  );

  const summary = await request(context.baseUrl, "/api/account/subscription", {
    cookie: `sg_session=${alpha.cookie}`,
  });

  checkEqual("existing entitlement stays visible while sales are off", summary.status, 200);
  checkEqual(
    "existing entitlement stays active while sales are off",
    summary.json?.subscription?.status,
    "active",
  );

  const creditBefore = (await me(context, alpha.cookie)).json?.account?.creditMicros;

  context.mock.reset();

  const includedCall = await request(context.baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${alpha.secret}` },
    body: {
      model: "mock-paid",
      messages: [{ role: "user", content: "included while sales off" }],
      max_tokens: 32,
    },
  });

  checkEqual("included usage still serves while sales are off", includedCall.status, 200);

  const settleRow = context.db
    .prepare(
      `SELECT billing_source FROM usage_events
       WHERE user_id = ? ORDER BY rowid DESC LIMIT 1`,
    )
    .get(alpha.id);

  checkEqual(
    "existing entitlement bills the subscription, not credit",
    settleRow?.billing_source,
    "subscription",
  );
  checkEqual(
    "included usage charges no credit while sales are off",
    (await me(context, alpha.cookie)).json?.account?.creditMicros,
    creditBefore,
  );
}

export async function runChecks(context) {
  await runAvailabilityChecks(context);

  const alpha = await runAuthChecks(context);
  const beta = await runBetaChecks(context);

  await runKeyIsolationChecks(context, alpha, beta);
  await runWebhookChecks(context, alpha);
  await runSettlementChecks(context, alpha, beta);
  const adminCookie = await runAdminChecks(context);

  await runSystemsChecks(context, alpha, adminCookie);
  await runSecurityChecks(context, alpha, beta, adminCookie);
  // Must run before the degradation probe: it drops a required table on
  // purpose. The comped subscription also changes how later calls are billed.
  await runPlanSalesChecks(context, alpha, adminCookie);
  await runCatalogIntegrityChecks(context, adminCookie);
  await runBenchmarkIntegrityChecks(context, adminCookie);
  await runCustomerExperienceChecks(context, alpha, beta);
  await runSupportChecks(context, alpha, beta, adminCookie);
  await runDegradeChecks(context);
}
