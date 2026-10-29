import { existsSync } from "node:fs";
import { join } from "node:path";

import { runChecks } from "./http-suite/checks.mjs";
import {
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
import { seedCatalog } from "./http-suite/seed.mjs";

const ADMIN_PASSWORD = "http-suite-admin-password";
const ADMIN_SECRET = "http-suite-admin-secret-0123456789abcdef";
const WEBHOOK_SECRET = "whsec_http_suite_0123456789abcdef";
const PROVIDER_KEY = "http-suite-provider-key";
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
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      STRIPE_SECRET_KEY: "sk_test_http_suite_placeholder",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      [PROVIDER_KEY_ENV]: PROVIDER_KEY,
    },
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  await waitForServer({ baseUrl, child: server.child, logs: server.logs });

  database = await waitForSchema(workspace.dbPath);
  seedCatalog(database, { mockBaseUrl: mock.baseUrl });

  await runChecks({
    baseUrl,
    db: database,
    mock,
    webhookSecret: WEBHOOK_SECRET,
    adminPassword: ADMIN_PASSWORD,
    providerKey: PROVIDER_KEY,
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
