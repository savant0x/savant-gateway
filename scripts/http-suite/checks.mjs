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
  await runDegradeChecks(context);
}
