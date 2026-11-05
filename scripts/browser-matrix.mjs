import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import {
  createTempWorkspace,
  logTail,
  reservePort,
  startMockUpstream,
  startNextServer,
  stopNextServer,
  waitForServer,
} from "./http-suite/harness.mjs";
import {
  openDatabase,
  startDatabaseServer,
  waitForSchema,
} from "./http-suite/db.mjs";
import { seedCatalog } from "./http-suite/seed.mjs";

const REPO = process.cwd();
const BUILD_MARKER = join(REPO, ".next", "BUILD_ID");
const ARTIFACT_DIR = join(REPO, ".scratch", "browser-matrix");
const ARTIFACT_JSON = join(ARTIFACT_DIR, "result.json");
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const PASSWORD = "browser-matrix-password";
const ADMIN_PASSWORD = "browser-matrix-admin-password";
const ADMIN_SECRET = "browser-matrix-admin-secret-0123456789";
const PROVIDER_KEY = "browser-matrix-provider-key";
const ITEM_ID = "browser-suite-video";
const ITEM_TITLE = "Browser Suite Video";
const COMMENT_AUTHOR = "Browser Fixture Commenter";
const COMMENT_BODY = "A top-level fixture comment for the reply journey.";
const SOURCE_ID = "browser-suite-source";
const COMMENT_ID = "browser-suite-comment";

function edgePath() {
  if (process.platform !== "win32") return null;

  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function launchBrowser() {
  const requestedChannel = process.env.PLAYWRIGHT_CHANNEL?.trim();

  if (requestedChannel) {
    console.log(`browser-matrix: launching channel ${requestedChannel}`);
    const browser = await chromium.launch({
      channel: requestedChannel,
      headless: true,
    });

    return { browser, label: `Playwright channel ${requestedChannel}` };
  }

  const edge = edgePath();

  if (edge) {
    console.log("browser-matrix: launching installed Microsoft Edge");
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });

    return { browser, label: "Microsoft Edge via Playwright" };
  }

  try {
    console.log("browser-matrix: launching bundled Chromium");
    const browser = await chromium.launch({ headless: true });

    return { browser, label: "Playwright bundled Chromium" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "No usable browser. Install Microsoft Edge or run " +
        `\`npx playwright install chromium\`; ${detail}`,
    );
  }
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { response, text, json };
}

async function signup(baseUrl, email, name) {
  const result = await apiJson(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      email,
      name,
      password: PASSWORD,
      acceptedPolicies: true,
    }),
  });

  assert.equal(
    result.response.status,
    201,
    `fixture signup ${email} failed: ${result.text}`,
  );
  assert.ok(result.json?.customer?.id, `fixture signup ${email} returned no id`);

  return result.json.customer;
}

async function waitForContentSchema(db) {
  const deadline = Date.now() + 60_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const rows = await db.query(
        `SELECT to_regclass('content.items')::text AS items,
                to_regclass('content.model_links')::text AS links,
                (SELECT COUNT(*)::int
                   FROM information_schema.columns
                  WHERE table_schema = 'content'
                    AND table_name = 'sources'
                    AND column_name = 'last_success_at') AS success_column,
                (SELECT COUNT(*)::int
                   FROM information_schema.columns
                  WHERE table_schema = 'content'
                    AND table_name = 'comments'
                    AND column_name = 'parent_id') AS parent_column`,
      );

      if (
        rows[0]?.items &&
        rows[0]?.links &&
        rows[0]?.success_column === 1 &&
        rows[0]?.parent_column === 1
      ) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `content schema not ready: ${
      lastError instanceof Error ? lastError.message : "timeout"
    }`,
  );
}

async function seedContent(db, commenterId) {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO content.sources
        (id, kind, label, url, config_json, enabled, fetch_interval_minutes,
         max_items, status, failure_streak, last_fetched_at, last_success_at,
         created_at, updated_at)
       VALUES (?, 'youtube', 'Browser Suite Source',
         'https://www.youtube.com/@browser-suite', '{}', 1, 60, 20,
         'active', 0, ?, ?, ?, ?)`,
    )
    .run(SOURCE_ID, now, now, now, now);

  await db
    .prepare(
      `INSERT INTO content.items
        (id, source_id, kind, title, url, external_url, excerpt, body_html,
         author, published_at, fetched_at, thumbnail_url, video_id, external_id,
         content_hash, created_at, updated_at)
       VALUES (?, ?, 'video', ?, ?, NULL, ?, ?, 'Browser Suite',
         ?, ?, NULL, 'dQw4w9WgXcQ', 'browser-suite-video', 'browser-fixture',
         ?, ?)`,
    )
    .run(
      ITEM_ID,
      SOURCE_ID,
      ITEM_TITLE,
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "A deterministic fixture item for the browser interaction receipt.",
      "<p>Browser fixture body.</p>",
      now,
      now,
      now,
      now,
    );

  await db
    .prepare("INSERT INTO content.item_tags (item_id, tag) VALUES (?, ?)")
    .run(ITEM_ID, "ai");
  await db
    .prepare("INSERT INTO content.item_tags (item_id, tag) VALUES (?, ?)")
    .run(ITEM_ID, "video");

  await db
    .prepare(
      `INSERT INTO content.comments
        (id, item_id, user_id, parent_id, body, created_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    )
    .run(COMMENT_ID, ITEM_ID, commenterId, COMMENT_BODY, now);
}

async function assertTheme(page, theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.classList.contains(expected),
    theme,
    { timeout: 15_000 },
  );

  const scheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );

  assert.match(
    scheme,
    new RegExp(theme),
    `resolved color-scheme is ${JSON.stringify(scheme)}, expected ${theme}`,
  );
}

async function assertVisibleFocus(page) {
  // Blurring is not enough: the browser keeps its sequential-focus starting
  // point at the last clicked control. Move focus to the body itself so Tab
  // starts at the first tabbable element in document order.
  await page.evaluate(() => {
    const body = document.body;

    body.tabIndex = -1;
    body.focus();
    body.removeAttribute("tabindex");
  });
  await page.keyboard.press("Tab");

  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = element ? getComputedStyle(element) : null;

    return {
      text: element?.textContent?.trim() ?? "",
      outlineStyle: style?.outlineStyle ?? "none",
      outlineWidth: Number.parseFloat(style?.outlineWidth ?? "0"),
      boxShadow: style?.boxShadow ?? "none",
    };
  });

  assert.equal(focus.text, "Skip to content", "the first Tab target is the skip link");
  assert.ok(
    focus.outlineStyle !== "none" ||
      focus.outlineWidth > 0 ||
      focus.boxShadow !== "none",
    "the focused skip link has no visible focus indicator",
  );
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );

  assert.ok(overflow <= 1, `mobile layout overflows by ${overflow}px`);
}

function trackErrors(page) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;

    const url = message.location().url;

    if (url && !url.startsWith("http://127.0.0.1")) return;

    errors.push(`console: ${message.text()}`);
  });

  return errors;
}

async function screenshotFailure(page, theme, journey) {
  const path = join(ARTIFACT_DIR, `${theme}-${journey.replace(/\W+/g, "-")}.png`);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page
    .screenshot({
      path,
      fullPage: true,
      mask: [page.locator("pre"), page.locator("input[type=password]")],
    })
    .catch(() => {});

  return path;
}

async function journey(theme, name, page, errors, action) {
  try {
    await action();
    assert.deepEqual(errors, [], `${theme}/${name}: ${errors.join("; ")}`);
    console.log(`browser-matrix: ${theme} ${name} PASS`);
  } catch (error) {
    const shot = await screenshotFailure(page, theme, name);
    const detail = error instanceof Error ? error.message : String(error);

    console.error(`browser-matrix: ${theme} ${name} FAIL: ${detail}`);
    console.error(`browser-matrix: failure screenshot ${shot}`);
    throw error;
  }
}

async function signInAtMobile(page, baseUrl, account) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await assertTheme(page, account.theme);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account", { timeout: 20_000 });
  await page
    .getByRole("heading", { level: 1, name: account.name })
    .waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page);
}

async function keyAndTopup(page) {
  await page.getByLabel("Key name").fill("Browser matrix key");
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByText("Copy this secret now").waitFor({ timeout: 20_000 });

  const secret = await page
    .locator("pre")
    .filter({ hasText: /^sk-[A-Za-z0-9_-]+$/ })
    .first()
    .textContent();

  assert.match(secret ?? "", /^sk-[A-Za-z0-9_-]{8,}$/);

  await page.getByText("Add credit", { exact: true }).waitFor();
  await page
    .getByLabel("Top-up amount in US dollars")
    .waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Continue with Card" })
    .waitFor({ state: "visible" });
}

async function paletteJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/models`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();

  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Search Signal" });

  await dialog.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "command-palette-input",
    "the palette input receives focus",
  );

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Search Signal" }).click();
  await dialog.waitFor({ state: "visible" });

  await page.getByLabel("Search Signal items, models, and topics").fill("Suite");
  await page.getByRole("option").filter({ hasText: ITEM_TITLE }).waitFor({
    timeout: 15_000,
  });
  assert.ok(
    (await page.getByRole("option").count()) >= 2,
    "the palette returns the item and the catalog model",
  );

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/signal/${ITEM_ID}`, { timeout: 15_000 });
}

async function videoJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/signal?kind=video`, { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: `Play ${ITEM_TITLE}` });

  await trigger.waitFor({ state: "visible" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: ITEM_TITLE });

  await dialog.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    (title) =>
      document.activeElement?.getAttribute("aria-label") === `Play ${title}`,
    ITEM_TITLE,
  );
}

async function replyJourney(page, baseUrl, theme) {
  await page.goto(`${baseUrl}/signal/${ITEM_ID}`, { waitUntil: "domcontentloaded" });

  const summary = page
    .locator("summary")
    .filter({ hasText: `Reply to ${COMMENT_AUTHOR}` });

  await summary.waitFor({ state: "visible" });
  await summary.click();

  const reply = `Reply from the ${theme} browser journey.`;

  await page.locator('textarea[placeholder^="Reply to"]').fill(reply);
  await page.getByRole("button", { name: "Post reply" }).click();
  await page.getByText(reply, { exact: true }).waitFor({ timeout: 20_000 });
}

async function reactionJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/signal/${ITEM_ID}`, { waitUntil: "domcontentloaded" });

  const useful = page.getByRole("button", { name: /^Useful\b/ });

  await useful.waitFor({ state: "visible" });
  assert.equal(
    await useful.getAttribute("aria-pressed"),
    "false",
    "the fixture reaction starts unselected",
  );
  await useful.click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((entry) =>
      entry.textContent?.trim().startsWith("Useful"),
    );

    return button?.getAttribute("aria-pressed") === "true";
  });
}

async function catalogJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/models`, { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder(
    "Search model, id, family, or OpenRouter id",
  );

  await search.waitFor({ state: "visible" });
  await search.fill("HTTP Suite Paid");
  await page.getByText("1 shown", { exact: false }).waitFor({ timeout: 10_000 });

  assert.ok(
    await page
      .getByRole("link")
      .filter({ hasText: "HTTP Suite Paid Model" })
      .first()
      .isVisible(),
    "the paid fixture model survives the filter",
  );
  assert.equal(
    await page
      .getByRole("link")
      .filter({ hasText: "HTTP Suite Free Model" })
      .count(),
    0,
    "the free fixture model is filtered out",
  );

  await page
    .getByRole("link")
    .filter({ hasText: "HTTP Suite Paid Model" })
    .first()
    .click();
  await page.waitForURL("**/models/mock-paid", { timeout: 15_000 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/models", { timeout: 15_000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
}

async function runTheme(browser, baseUrl, theme, account) {
  const context = await browser.newContext({
    viewport: MOBILE,
    colorScheme: theme,
    deviceScaleFactor: 1,
  });

  await context.addInitScript((value) => {
    try {
      // next-themes defaults its storage key to `theme`; keep the legacy
      // `next-themes` key too so the harness is explicit about the resolved key.
      window.localStorage.setItem("theme", value);
      window.localStorage.setItem("next-themes", value);
    } catch {
      // Cross-origin embeds (for example the video iframe) deny storage.
    }
  }, theme);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const loopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "::1";

    if (loopback) {
      // Vercel injects this telemetry asset at the edge. A local production
      // build has no such route, so serve an empty script rather than letting
      // infrastructure noise count as an application console error.
      if (url.pathname.startsWith("/_vercel/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "",
        });

        return;
      }

      await route.continue();

      return;
    }

    await route.abort();
  });

  const page = await context.newPage();

  page.setDefaultTimeout(20_000);

  const errors = trackErrors(page);
  const completed = [];

  try {
    await journey(theme, "mobile sign-in, key reveal and top-up entry", page, errors, async () => {
      await signInAtMobile(page, baseUrl, account);
      await assertVisibleFocus(page);
      await keyAndTopup(page);
      await assertNoHorizontalOverflow(page);
      await assertTheme(page, theme);
    });
    completed.push("mobile sign-in, key reveal and top-up entry");

    await page.setViewportSize(DESKTOP);

    await journey(theme, "palette open/select/Escape", page, errors, async () => {
      await paletteJourney(page, baseUrl);
    });
    completed.push("palette open/select/Escape");

    await journey(theme, "video dialog Escape and focus return", page, errors, async () => {
      await videoJourney(page, baseUrl);
    });
    completed.push("video dialog Escape and focus return");

    await journey(theme, "reply", page, errors, async () => {
      await replyJourney(page, baseUrl, theme);
    });
    completed.push("reply");

    await journey(theme, "reaction", page, errors, async () => {
      await reactionJourney(page, baseUrl);
    });
    completed.push("reaction");

    await journey(theme, "catalog filter and Back", page, errors, async () => {
      await catalogJourney(page, baseUrl);
    });
    completed.push("catalog filter and Back");

    return { theme, completed };
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(
    existsSync(BUILD_MARKER),
    "browser-matrix: production build missing; run `npm run build` first",
  );

  const workspace = await createTempWorkspace();
  const serverPort = await reservePort();
  const databasePort = await reservePort();
  const mock = await startMockUpstream({ expectedKey: PROVIDER_KEY });
  const databaseServer = await startDatabaseServer({
    directory: workspace.databaseDirectory,
    port: databasePort,
    connectionString: process.env.HTTP_TEST_DATABASE_URL?.trim(),
  });
  let server = null;
  let database = null;
  let browser = null;

  try {
    server = startNextServer({
      repo: REPO,
      port: serverPort,
      databaseUrl: databaseServer.connectionString,
      env: {
        ADMIN_PASSWORD,
        ADMIN_SESSION_SECRET: ADMIN_SECRET,
        CARD_TOPUPS_ENABLED: "true",
        CONTENT_ENABLED: "true",
        CONTENT_INGEST_ENABLED: "false",
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${serverPort}`,
        GATEWAY_DISPOSABLE_START: "yes",
        PAID_KEY_RPM: "60",
        TRIAL_ENABLED: "false",
        STRIPE_SECRET_KEY: "sk_test_browser_matrix_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_browser_matrix_placeholder",
        PROVIDER_KEY: "",
        COMMANDCODE_API_KEY: "",
        ARTIFICIAL_ANALYSIS_API_KEY: "",
        HTTP_SUITE_PROVIDER_KEY: PROVIDER_KEY,
      },
    });

    const baseUrl = `http://127.0.0.1:${serverPort}`;

    await waitForServer({ baseUrl, child: server.child, logs: server.logs });

    database = await openDatabase(databaseServer.connectionString);
    await waitForSchema(database);
    await waitForContentSchema(database);
    await seedCatalog(database, { mockBaseUrl: mock.baseUrl });

    const commenter = await signup(
      baseUrl,
      "browser-commenter@example.test",
      COMMENT_AUTHOR,
    );

    await seedContent(database, commenter.id);

    const accounts = [
      {
        theme: "light",
        email: "browser-light@example.test",
        name: "Browser Light",
      },
      {
        theme: "dark",
        email: "browser-dark@example.test",
        name: "Browser Dark",
      },
    ];

    for (const account of accounts) {
      await signup(baseUrl, account.email, account.name);
    }

    const launched = await launchBrowser();

    browser = launched.browser;

    const results = [];

    for (const account of accounts) {
      results.push(await runTheme(browser, baseUrl, account.theme, account));
    }

    const buildId = await import("node:fs/promises").then(({ readFile }) =>
      readFile(BUILD_MARKER, "utf8"),
    );
    const result = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      baseUrl,
      buildId: buildId.trim(),
      themes: results,
      checks: results.reduce(
        (total, entry) => total + entry.completed.length,
        0,
      ),
      browser: launched.label,
    };

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(ARTIFACT_JSON, `${JSON.stringify(result, null, 2)}\n`);

    console.log(
      `browser-matrix: ${result.checks} journey checks PASS ` +
        `(build ${result.buildId})`,
    );
    console.log(`browser-matrix: receipt ${ARTIFACT_JSON}`);
  } catch (error) {
    if (server) {
      console.error(`browser-matrix: server log tail\n${logTail(server.logs)}`);
    }

    throw error;
  } finally {
    await browser?.close();
    await database?.close();
    await databaseServer.close();
    await mock.close();
    if (server) await stopNextServer(server.child);
    await workspace.remove();
  }
}

main().catch((error) => {
  console.error(
    `browser-matrix FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
