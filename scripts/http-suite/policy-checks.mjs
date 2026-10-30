import { check, checkEqual, cookieValue, request } from "./harness.mjs";

const PAGES = [
  { path: "/terms", title: "Terms of service" },
  { path: "/privacy", title: "Privacy notice" },
  { path: "/refunds", title: "Refunds and disputes" },
  { path: "/acceptable-use", title: "Acceptable use" },
];

const PLACEHOLDER = /\[(?:OPERATOR DECISION|JURISDICTION|DATE|LEGAL ENTITY|CONTACT|RETENTION)/;

// Signup is rate limited per client key, and the main suite already spends the
// shared bucket. A distinct forwarded address keeps this module independent.
const CLIENT = { "x-forwarded-for": "198.51.100.7" };

/**
 * Published policy routes and the acceptance record. The gate proves three
 * things: the documents are served with no unreplaced placeholder, an account
 * cannot exist without a recorded acceptance, and the acceptance is idempotent
 * and same-origin only.
 */
export async function runPolicyChecks({ baseUrl, db }) {
  for (const page of PAGES) {
    const response = await request(baseUrl, page.path);

    checkEqual(`policy ${page.path} serves`, response.status, 200);
    check(
      `policy ${page.path} is html`,
      (response.headers.get("content-type") ?? "").includes("text/html"),
      response.headers.get("content-type") ?? "missing",
    );
    check(
      `policy ${page.path} renders its title`,
      response.text.includes(page.title),
    );
    check(
      `policy ${page.path} states the effective version`,
      /datetime="2026-10-30"/i.test(response.text) &&
        response.text.includes("30 October 2026") &&
        response.text.includes("Effective"),
    );
    check(
      `policy ${page.path} has no unreplaced placeholder`,
      !PLACEHOLDER.test(response.text) && !response.text.includes("not published"),
    );
  }

  const terms = await request(baseUrl, "/terms");

  check(
    "terms name the operator and contact",
    terms.text.includes("Savant AI") && terms.text.includes("spencerhowell84@gmail.com"),
  );
  check(
    "terms state the no-uptime position",
    terms.text.includes("no uptime guarantee"),
  );
  check(
    "terms state that subscriptions are not for sale",
    terms.text.includes("Subscriptions are not for sale"),
  );

  const permanent = await request(baseUrl, "/legal/v1/terms");

  checkEqual("the superseded version stays reachable", permanent.status, 200);
  check(
    "the superseded version is marked as superseded",
    permanent.text.includes("superseded"),
  );

  const currentVersionRoute = await request(baseUrl, "/legal/v1.1/terms");

  checkEqual("the current version has a permanent route too", currentVersionRoute.status, 200);

  const unknownVersion = await request(baseUrl, "/legal/v2/terms");

  checkEqual("an unpublished policy version is not served", unknownVersion.status, 404);

  const index = await request(baseUrl, "/legal");

  checkEqual("legal index serves", index.status, 200);
  check(
    "legal index lists every policy",
    PAGES.every((page) => index.text.includes(page.title)),
  );

  const footer = await request(baseUrl, "/");
  const footerLinks = PAGES.every((page) => footer.text.includes(`href="${page.path}"`));

  check("footer links every policy", footerLinks);

  // Acceptance is required at signup: a request without it must not create an
  // account, and must not leave an acceptance row behind either.
  const refused = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: CLIENT,
    body: {
      email: "refused.policy-suite@example.test",
      name: "Refused Policy Suite",
      password: "policy-suite-password",
    },
  });

  checkEqual("signup without acceptance is refused", refused.status, 400);
  check(
    "refusal tells the customer what to accept",
    (refused.json?.error ?? "").includes("Accept the terms of service"),
    refused.text,
  );

  const created = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: CLIENT,
    body: {
      email: "accepted.policy-suite@example.test",
      name: "Accepted Policy Suite",
      password: "policy-suite-password",
      acceptedPolicies: true,
    },
  });

  checkEqual("signup with acceptance succeeds", created.status, 201);

  const userId = created.json?.customer?.id;
  const session = cookieValue(created, "sg_session");

  check("signup returns a session", Boolean(userId && session));

  const stored = db
    .prepare("SELECT version, source FROM policy_acceptances WHERE user_id = ?")
    .get(userId);

  checkEqual("signup records the accepted version", stored?.version, "v1.1");
  checkEqual("signup records the acceptance source", stored?.source, "signup");

  // Replacing the current row with a v1 acceptance models a customer who agreed
  // to the earlier version: v1.1 is a new version, so they must be asked again.
  db.prepare("DELETE FROM policy_acceptances WHERE user_id = ?").run(userId);
  db.prepare(
    `INSERT INTO policy_acceptances (id, user_id, version, source, accepted_at)
     VALUES ('policy_legacy_v1', ?, 'v1', 'signup', ?)`,
  ).run(userId, new Date().toISOString());

  const cookie = `sg_session=${session}`;
  const account = await request(baseUrl, "/account", { cookie });

  checkEqual("account page serves for a signed-in customer", account.status, 200);
  check(
    "account page asks for the new version after an older acceptance",
    account.text.includes("I accept these policies"),
  );

  const crossOrigin = await request(baseUrl, "/api/account/policies", {
    method: "POST",
    cookie,
    origin: "https://cross-origin.example.test",
    body: { version: "v1.1" },
  });

  checkEqual("cross-origin acceptance is rejected", crossOrigin.status, 403);

  const signedOut = await request(baseUrl, "/api/account/policies", {
    method: "POST",
    body: { version: "v1.1" },
  });

  checkEqual("signed-out acceptance is rejected", signedOut.status, 401);

  const wrongVersion = await request(baseUrl, "/api/account/policies", {
    method: "POST",
    cookie,
    body: { version: "v0" },
  });

  checkEqual("accepting an unknown version is rejected", wrongVersion.status, 400);

  const accepted = await request(baseUrl, "/api/account/policies", {
    method: "POST",
    cookie,
    body: { version: "v1.1" },
  });

  checkEqual("account acceptance is recorded", accepted.status, 201);
  checkEqual("account acceptance reports its source", accepted.json?.acceptance?.source, "account");

  const repeated = await request(baseUrl, "/api/account/policies", {
    method: "POST",
    cookie,
    body: { version: "v1.1" },
  });

  checkEqual("repeating acceptance is accepted", repeated.status, 201);

  const rows = db
    .prepare(
      "SELECT COUNT(*) AS total FROM policy_acceptances WHERE user_id = ? AND version = 'v1.1'",
    )
    .get(userId);

  checkEqual("acceptance is idempotent per version", rows?.total, 1);

  const legacy = db
    .prepare(
      "SELECT COUNT(*) AS total FROM policy_acceptances WHERE user_id = ? AND version = 'v1'",
    )
    .get(userId);

  checkEqual("the earlier acceptance is kept as history", legacy?.total, 1);

  const after = await request(baseUrl, "/account", { cookie });

  check(
    "account page stops asking once accepted",
    !after.text.includes("I accept these policies"),
  );
}
