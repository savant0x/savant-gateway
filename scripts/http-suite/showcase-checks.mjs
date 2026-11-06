import { readFileSync } from "node:fs";
import path from "node:path";

import {
  catalogIdentityDigest,
  sha256Hex,
} from "../../lib/visual-builds/types.ts";

import { check, checkEqual, request } from "./harness.mjs";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "pelican");
const RESULT_PATH = "results/gpt-6-1-sol-high-run-01.json";
export const SOURCE_ID = "src_http_suite_pelican";
export const BUILD_ID = "bld_http_suite_pelican";
export const REVISION_ID = "rev_http_suite_pelican";
export const SHOWCASE_MODEL_ID = "showcase-http-model";
const RIGHTS_ID = "rgt_http_suite_pelican";
const NOW = "2026-11-05T12:00:00.000Z";

function readFixture(relative) {
  return readFileSync(path.join(ROOT, relative));
}

/**
 * Seeds a published fixture through the same tables the real store writes. It
 * exercises the public projection and withdrawal behavior without making the
 * HTTP gate spend a third-party request.
 */
export async function seedPublishedBuild(db) {
  const raw = readFixture(RESULT_PATH).toString("utf8");
  const record = JSON.parse(raw);
  const prompt = readFixture("prompt.txt").toString("utf8");
  const artifact = readFixture(`artifacts/${record.id}.js`);
  const thumbnail = readFixture(`thumbnails/${record.id}.jpg`);
  const license = readFixture("LICENSE").toString("utf8");
  const artifactSha = sha256Hex(artifact);
  const thumbnailSha = sha256Hex(thumbnail);
  const promptSha = sha256Hex(prompt);
  const rawSha = sha256Hex(raw);
  const licenseSha = sha256Hex(license);
  // Its own catalog row keeps this fixture independent of every earlier
  // pricing, group and catalog-integrity probe in the same disposable server.
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, context_window, synced_at,
         in_catalog, status, cost_source)
       VALUES ('showcase-http-model', 'showcase-http-model',
               'Showcase HTTP Model', 'Pelican Test', '200k', ?, 1, 'active',
               'manual')
       ON CONFLICT (id) DO UPDATE SET name = excluded.name,
         provider = excluded.provider, in_catalog = 1, status = 'active'`,
    )
    .run(NOW);

  const digest = catalogIdentityDigest({
    id: "showcase-http-model",
    upstreamId: "showcase-http-model",
    name: "Showcase HTTP Model",
    family: "Pelican Test",
    inCatalog: true,
    status: "active",
  });

  await db
    .prepare(
      `INSERT INTO showcase.sources
        (id, kind, label, base_url, revision, enabled, max_storage_bytes,
         created_at, updated_at)
       VALUES (?, 'pelican_sdf', 'HTTP Suite Pelican',
               'https://raw.githubusercontent.com/AzatJalilov/PelicanSdf/63190d7e5fb883175b8612374de5e7f094293548/',
               '63190d7e5fb883175b8612374de5e7f094293548', 1, 67108864, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(SOURCE_ID, NOW, NOW);
  await db
    .prepare(
      `INSERT INTO showcase.source_rights
        (id, source_id, state, evidence_url, evidence_note, evidence_sha256,
         license_text, license_sha256, attribution, display_allowed,
         cache_allowed, redistribute_allowed, reviewer, reviewed_at,
         superseded_by, created_at)
       VALUES (?, ?, 'approved',
               'https://github.com/AzatJalilov/PelicanSdf',
               'HTTP fixture decision; not a production publication approval.',
               ?, ?, ?, 'Pelican SDF contributors', 1, 1, 1, 'http-suite', ?,
               NULL, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      RIGHTS_ID,
      SOURCE_ID,
      sha256Hex(`${SOURCE_ID}\0fixture`),
      license,
      licenseSha,
      NOW,
      NOW,
    );
  for (const [id, kind, mime, bytes, sha] of [
    ["ast_http_suite_artifact", "artifact", "text/javascript; charset=utf-8", artifact, artifactSha],
    ["ast_http_suite_thumbnail", "thumbnail", "image/jpeg", thumbnail, thumbnailSha],
  ]) {
    await db
      .prepare(
        `INSERT INTO showcase.assets
          (id, source_id, sha256, mime, kind, bytes, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(id, SOURCE_ID, sha, mime, kind, bytes, bytes.length, NOW);
  }
  await db
    .prepare(
      `INSERT INTO showcase.builds
        (id, source_id, external_id, visibility, published_revision_id,
         published_at, withdrawal_note, created_at, updated_at)
       VALUES (?, ?, ?, 'published', ?, ?, NULL, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      BUILD_ID,
      SOURCE_ID,
      record.id,
      REVISION_ID,
      NOW,
      NOW,
      NOW,
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      REVISION_ID,
      BUILD_ID,
      rawSha,
      SOURCE_ID,
      "https://github.com/AzatJalilov/PelicanSdf",
      "63190d7e5fb883175b8612374de5e7f094293548",
      record.title,
      record.description ?? "",
      record.model,
      record.model,
      record.provider.split(/\s+via\s+/i)[0],
      record.provider,
      record.track ?? "one-shot",
      "high",
      "HTTP fixture",
      record.status,
      record.validation?.state ?? "unreviewed",
      record.createdAt,
      prompt,
      promptSha,
      raw,
      rawSha,
      Math.round((record.generationUsage?.apiCostUsd ?? 0) * 1_000_000),
      Math.round(record.metrics?.initMs ?? 0),
      "ast_http_suite_artifact",
      "ast_http_suite_thumbnail",
      license,
      licenseSha,
      NOW,
    );
  await db
    .prepare(
      `INSERT INTO showcase.bindings
        (id, revision_id, model_id, state, method, reason, catalog_digest,
         reviewer, reviewed_at, created_at)
       VALUES ('bnd_http_suite_pelican', ?, 'showcase-http-model',
               'accepted', 'exact_id',
               'HTTP fixture exact binding.', ?, 'http-suite', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(REVISION_ID, digest, NOW, NOW);
}

export async function runShowcaseChecks({ baseUrl, db, adminCookie }) {
  await seedPublishedBuild(db);

  const gallery = await request(baseUrl, "/showcase");

  checkEqual("the public showcase renders", gallery.status, 200);
  check(
    "the public showcase lists the published fixture",
    gallery.text.includes("GPT-6.1 Sol / high effort"),
    gallery.text.slice(0, 200),
  );

  const detail = await request(baseUrl, `/showcase/${BUILD_ID}`);

  checkEqual("a published visual-build page renders", detail.status, 200);
  check(
    "the detail page embeds the sandboxed artifact",
    detail.text.includes("Sandboxed WebGL2 artifact"),
    detail.text.slice(0, 200),
  );

  const bundle = await request(baseUrl, `/api/showcase/${BUILD_ID}`);

  checkEqual("the public bundle answers", bundle.status, 200);
  check(
    "the bundle carries the reviewed artifact",
    String(bundle.json?.html ?? "").includes("createPelicanSdf"),
  );
  checkEqual(
    "the bundle names its exact revision",
    bundle.json?.revisionId,
    REVISION_ID,
  );
  checkEqual(
    "the bundle refuses content sniffing",
    bundle.headers.get("x-content-type-options"),
    "nosniff",
  );
  checkEqual(
    "the bundle is not cached after a rights change",
    bundle.headers.get("cache-control"),
    "no-store",
  );
  check(
    "the bundle has a stable content hash",
    /^[a-f0-9]{64}$/.test(String(bundle.json?.sha256 ?? "")),
  );

  const preview = await fetch(`${baseUrl}/api/showcase/${BUILD_ID}/preview`);
  const previewBytes = new Uint8Array(await preview.arrayBuffer());

  checkEqual("the preview answers", preview.status, 200);
  checkEqual(
    "the preview is a JPEG",
    preview.headers.get("content-type"),
    "image/jpeg",
  );
  check(
    "the preview starts with the JPEG magic",
    previewBytes[0] === 0xff && previewBytes[1] === 0xd8,
  );

  const anonymousAdmin = await request(baseUrl, "/api/admin/showcase");

  checkEqual("anonymous showcase admin is rejected", anonymousAdmin.status, 401);

  const admin = await request(baseUrl, "/api/admin/showcase", {
    cookie: `sg_admin=${adminCookie}`,
  });

  checkEqual("the showcase review API answers", admin.status, 200);
  check(
    "the review API lists the fixture build",
    Array.isArray(admin.json?.builds) &&
      admin.json.builds.some((build) => build.buildId === BUILD_ID),
    admin.text.slice(0, 300),
  );

  const republish = await request(baseUrl, "/api/admin/showcase", {
    method: "POST",
    cookie: `sg_admin=${adminCookie}`,
    body: { action: "publish", buildId: BUILD_ID, reviewer: "http-suite" },
  });

  checkEqual("republishing is refused", republish.status, 409);

  await db
    .prepare(`UPDATE showcase.source_rights SET state = 'withdrawn' WHERE id = ?`)
    .run(RIGHTS_ID);

  const hidden = await request(baseUrl, `/api/showcase/${BUILD_ID}`);

  checkEqual("withdrawing rights removes the bundle immediately", hidden.status, 404);
  checkEqual(
    "withdrawn rights remove the gallery card",
    (await request(baseUrl, "/showcase")).text.includes("GPT-6.1 Sol / high effort"),
    false,
  );

  await db
    .prepare(`UPDATE showcase.source_rights SET state = 'approved' WHERE id = ?`)
    .run(RIGHTS_ID);

  const restored = await request(baseUrl, `/api/showcase/${BUILD_ID}`);

  checkEqual("re-approved rights restore the bundle", restored.status, 200);

  await db
    .prepare(`UPDATE models SET name = 'Renamed Showcase Model' WHERE id = 'showcase-http-model'`)
    .run();

  checkEqual(
    "a catalog identity change removes the bundle",
    (await request(baseUrl, `/api/showcase/${BUILD_ID}`)).status,
    404,
  );

  await db
    .prepare(`UPDATE models SET name = 'Showcase HTTP Model' WHERE id = 'showcase-http-model'`)
    .run();

  checkEqual(
    "restoring the catalog identity restores the bundle",
    (await request(baseUrl, `/api/showcase/${BUILD_ID}`)).status,
    200,
  );
}
