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
  waitForSchema,
  waitForServer,
} from "./http-suite/harness.mjs";
import { runMetadataChecks } from "./http-suite/metadata-checks.mjs";
import { seedCatalog } from "./http-suite/seed.mjs";
import { runPolicyChecks } from "./http-suite/policy-checks.mjs";
import { runQuotaChecks } from "./http-suite/quota-checks.mjs";

const ADMIN_PASSWORD = "http-suite-admin-password";
const ADMIN_SECRET = "http-suite-admin-secret-0123456789abcdef";
const WEBHOOK_SECRET = "whsec_http_suite_0123456789abcdef";
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
const mock = await startMockUpstream({ expectedKey: PROVIDER_KEY });
let server = null;
let database = null;

try {
  server = startNextServer({
    repo,
    port: serverPort,
    dbPath: workspace.dbPath,
    env: {
      ADMIN_PASSWORD,
      // Deliberately blank: the suite must mirror a deployment that has no
      // configured fallback ceiling, so a stale observation is actually
      // observable here instead of being papered over by a default that
      // production does not set (FID-069). A current upstream rpm still wins.
      PROVIDER_SHARED_RPM: "",
      TRIAL_ENABLED: "false",
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      STRIPE_SECRET_KEY: "sk_test_http_suite_placeholder",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ARTIFICIAL_ANALYSIS_API_KEY: BENCHMARK_KEY,
      // The fixture source is local; no third-party quota is spent by the gate.
      ARTIFICIAL_ANALYSIS_BASE_URL: mock.baseUrl,
      PROVIDER_KEY: "",
      COMMANDCODE_API_KEY: "",
      // The suite proves disposable production startup: loopback origin,
      // throwaway database file. The validator requires this to be spelled
      // out rather than silently allowing a temp-database production start.
      GATEWAY_DISPOSABLE_START: "yes",
      [PROVIDER_KEY_ENV]: PROVIDER_KEY,
    },
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  await waitForServer({ baseUrl, child: server.child, logs: server.logs });

  database = await waitForSchema(workspace.dbPath);
  seedCatalog(database, { mockBaseUrl: mock.baseUrl });

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

  // Runs before the main checks: one of those deliberately drops a required
  // table to prove readiness fails closed, which makes the database unusable
  // for any later page request.
  await runPolicyChecks({ baseUrl, db: database });

  await runQuotaChecks({ baseUrl, db: database, mock, adminPassword: ADMIN_PASSWORD });

  await runChecks({
    baseUrl,
    db: database,
    mock,
    webhookSecret: WEBHOOK_SECRET,
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
  database?.close();
  await mock.close();
  if (server) await stopNextServer(server.child);
  await workspace.remove();
}
