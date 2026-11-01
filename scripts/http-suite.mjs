import { existsSync } from "node:fs";
import { join } from "node:path";

import { runChecks } from "./http-suite/checks.mjs";
import {
  checkProviderDouble,
  createTempWorkspace,
  logTail,
  reservePort,
  startMockUpstream,
  startNextServer,
  stopNextServer,
  summary,
  waitForServer,
} from "./http-suite/harness.mjs";
import {
  openDatabase,
  startDatabaseServer,
  waitForSchema,
} from "./http-suite/db.mjs";
import { runMetadataChecks } from "./http-suite/metadata-checks.mjs";
import { seedCatalog } from "./http-suite/seed.mjs";
import { runOperationsChecks } from "./http-suite/operations-checks.mjs";
import { runPolicyChecks } from "./http-suite/policy-checks.mjs";
import { runPromoChecks } from "./http-suite/promo-checks.mjs";
import { runQuotaChecks } from "./http-suite/quota-checks.mjs";
import { runRequestLimitChecks } from "./http-suite/request-limit-checks.mjs";
import { runAccountRecoveryChecks, startEmailDouble } from "./http-suite/account-recovery-checks.mjs";

const ADMIN_PASSWORD = "http-suite-admin-password";
const ADMIN_SECRET = "http-suite-admin-secret-0123456789abcdef";
const WEBHOOK_SECRET = "whsec_http_suite_0123456789abcdef";
const IPN_SECRET = "nowpayments-ipn-secret-0123456789abcdef";
const PROVIDER_KEY = "http-suite-provider-key";
const BENCHMARK_KEY = "http-suite-benchmark-key";
const PROVIDER_KEY_ENV = "HTTP_SUITE_PROVIDER_KEY";

const repo = process.cwd();
const buildMarker = join(repo, ".next", "BUILD_ID");

if (!existsSync(buildMarker)) {
  console.error(
    "http-suite: production build missing. Run `npm run build` before this gate.",
  );
  process.exit(1);
}

const workspace = await createTempWorkspace();
const serverPort = await reservePort();
const databasePort = await reservePort();
const mock = await startMockUpstream({ expectedKey: PROVIDER_KEY });
const email = await startEmailDouble();
const databaseServer = await startDatabaseServer({
  directory: workspace.databaseDirectory,
  port: databasePort,
});
let server = null;
let database = null;

try {
  server = startNextServer({
    repo,
    port: serverPort,
    databaseUrl: databaseServer.connectionString,
    env: {
      ADMIN_PASSWORD,
      // Deliberately blank: the suite must mirror a deployment that has no
      // configured fallback ceiling, so a stale observation is actually
      // observable here instead of being papered over by a default that
      // production does not set (FID-069). A current upstream rpm still wins.
      PROVIDER_SHARED_RPM: "",
      TRIAL_ENABLED: "false",
      PROMO_CODES_ENABLED: "true",
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      STRIPE_SECRET_KEY: "sk_test_http_suite_placeholder",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      // The crypto lane mirrors the card lane: credentials exist so the webhook
      // can run fully local, but the policy flag is deliberately unset. The
      // checkout route must refuse with crypto_topups_disabled, proving the
      // policy gate precedes the config gate.
      NOWPAYMENTS_API_KEY: "np_http_suite_placeholder_key",
      NOWPAYMENTS_IPN_SECRET: IPN_SECRET,
      ARTIFICIAL_ANALYSIS_API_KEY: BENCHMARK_KEY,
      // The fixture source is local; no third-party quota is spent by the gate.
      ARTIFICIAL_ANALYSIS_BASE_URL: mock.baseUrl,
      PROVIDER_KEY: "",
      COMMANDCODE_API_KEY: "",
      // The suite proves disposable production startup: loopback origin,
      // throwaway database file. The validator requires this to be spelled
      // out rather than silently allowing a temp-database production start.
      GATEWAY_DISPOSABLE_START: "yes",
      EMAIL_TRANSPORT: "resend",
      EMAIL_FROM: "sender@example.test",
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${serverPort}`,
      RESEND_API_KEY: "fixture-email-key",
      RESEND_API_URL: email.url,
      [PROVIDER_KEY_ENV]: PROVIDER_KEY,
    },
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  await waitForServer({ baseUrl, child: server.child, logs: server.logs });

  database = await openDatabase(databaseServer.connectionString);
  await waitForSchema(database);
  await seedCatalog(database, { mockBaseUrl: mock.baseUrl });

  // Before anything depends on the fixture: every endpoint its provider row
  // advertises must really be answered, with a payload the gateway would
  // accept (FID-2026-1030-070).
  await checkProviderDouble({
    db: database,
    slug: "mock",
    upstreamUrl: mock.baseUrl,
    apiKey: PROVIDER_KEY,
  });

  // Needs a populated catalog, so it runs before anything that leaves the
  // database unusable for a page request.
  await runMetadataChecks({ baseUrl });

  await runPromoChecks({ baseUrl, db: database, adminPassword: ADMIN_PASSWORD });

  // Runs before the main checks: one of those deliberately drops a required
  // table to prove readiness fails closed, which makes the database unusable
  // for any later page request.
  await runPolicyChecks({ baseUrl, db: database });

  await runQuotaChecks({ baseUrl, db: database, mock, adminPassword: ADMIN_PASSWORD });

  await runRequestLimitChecks({ baseUrl, db: database, mock, adminPassword: ADMIN_PASSWORD });

  await runAccountRecoveryChecks({ baseUrl, db: database, email });

  // Runs before the main checks: that suite deliberately drops a required
  // table to prove readiness fails closed. This drill restores admission,
  // provider state and its fixture rows before returning.
  await runOperationsChecks({
    baseUrl,
    db: database,
    mock,
    adminPassword: ADMIN_PASSWORD,
  });

  await runChecks({
    baseUrl,
    db: database,
    mock,
    webhookSecret: WEBHOOK_SECRET,
    ipnSecret: IPN_SECRET,
    adminPassword: ADMIN_PASSWORD,
    providerKey: PROVIDER_KEY,
    logs: server.logs,
  });

  console.log(`http-suite: ${summary()} checks PASS`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`http-suite FAIL: ${message}`);

  if (server) {
    console.error(`http-suite: server log tail\n${logTail(server.logs)}`);
  }

  if (mock.state.lastRequest) {
    console.error(
      `http-suite: last mock request ${JSON.stringify(mock.state.lastRequest)}`,
    );
  }

  process.exitCode = 1;
} finally {
  await database?.close();
  await databaseServer.close();
  await mock.close();
  await email.close();
  if (server) await stopNextServer(server.child);
  await workspace.remove();
}
