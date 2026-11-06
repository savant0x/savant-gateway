#!/usr/bin/env node
/**
 * Disposable backup/restore drill against PostgreSQL (FID-086 step 6).
 *
 * The SQLite drill copied files and restarted the server on the copy. Neither
 * step exists now, so the drill proves what actually matters for this engine:
 *
 *   1. seed a reconciled credit history and dump it,
 *   2. destroy the source database — a deleted PGlite directory, which is the
 *      closest local equivalent of losing the volume,
 *   3. restore into a fresh database and read a spendable balance back out of
 *      it, not just matching row counts,
 *   4. prove a tampered dump and a truncated dump are both refused, and that a
 *      refused restore leaves its target untouched.
 *
 * The HTTP-level proof (boot the server on the restored database and read
 * `/api/admin/reconciliation`) returns with the storage flip in FID-086 step 4;
 * the application still runs on SQLite, so booting it here would prove nothing
 * about the restored copy.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BackupRefused,
  dumpDatabase,
  restoreDatabase,
} from "../lib/storage/backup.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { availableCredit } from "../lib/storage/store/credit.ts";
import { sha256Hex } from "../lib/visual-builds/types.ts";

const NOW = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 60_000).toISOString();
const RECOVERY_USER = "recovery-user";
const WRITER_USER = "writer-user";
const SHOWCASE_SOURCE = "showcase-drill-source";
const SHOWCASE_ASSET = "showcase-drill-asset";
const SHOWCASE_BUILD = "showcase-drill-build";
const SHOWCASE_REVISION = "showcase-drill-revision";
const SHOWCASE_ARTIFACT = "export function createPelicanSdf(canvas) {}\n";
const SHOWCASE_SHA = sha256Hex(Buffer.from(SHOWCASE_ARTIFACT, "utf8"));

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`recovery-drill: PASS ${label}`);

    return;
  }

  failures += 1;
  console.error(`recovery-drill: FAIL ${label}${detail ? `: ${detail}` : ""}`);
}

async function seed(db) {
  await db
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, 'recovery@drill.invalid', 'Recovery Drill', 'active', ?, 5000, 250),
              (?, 'writer@drill.invalid', 'Concurrent Writer', 'active', ?, 0, 0)`,
    )
    .run(RECOVERY_USER, NOW, WRITER_USER, NOW);

  await db
    .prepare(
      `INSERT INTO api_keys
        (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_recovery', ?, 'drill', 'sg_drill', 'sha256:drill', 'active', ?)`,
    )
    .run(RECOVERY_USER, NOW);

  await db
    .prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
       VALUES ('ledger_topup', ?, 'topup', 8000, 8000, 'drill top-up', ?),
              ('ledger_usage', ?, 'usage', -3000, 5000, 'drill usage', ?)`,
    )
    .run(RECOVERY_USER, NOW, RECOVERY_USER, NOW);

  await db
    .prepare(
      `INSERT INTO credit_holds
        (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
       VALUES ('hold_recovery', ?, 'key_recovery', 'drill-model', 250, ?, ?)`,
    )
    .run(RECOVERY_USER, NOW, EXPIRES);

  await db
    .prepare(
      `INSERT INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES ('topup_recovery', ?, 'nowpayments', 'np_recovery_drill', 8000,
               'usd', 'paid', ?, ?)`,
    )
    .run(RECOVERY_USER, NOW, NOW);

  await db
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, api_key_id, model_id, input_tokens, output_tokens,
         weighted_tokens, cost_micros, charged_micros, status, latency_ms,
         created_at)
       VALUES ('usage_recovery', ?, 'key_recovery', 'drill-model', 10, 20, 30,
               3000, 3000, 'ok', 120, ?)`,
    )
    .run(RECOVERY_USER, NOW);

  await db
    .prepare(
      `INSERT INTO settlements
        (id, user_id, api_key_id, model_id, provider_slug, billing_source,
         credit_hold_id, estimated_micros, status, created_at, settled_at)
       VALUES ('stl_recovery', ?, 'key_recovery', 'drill-model', 'mock',
               'credit', 'hold_recovery', 3000, 'committed', ?, ?),
              ('stl_pending', ?, 'key_recovery', 'drill-model', 'mock',
               'credit', NULL, 100, 'admitted', ?, NULL)`,
    )
    .run(RECOVERY_USER, NOW, NOW, RECOVERY_USER, NOW);

  await db
    .prepare(
      `INSERT INTO quarantined_holds
        (id, kind, user_id, api_key_id, model_id, reserved, created_at,
         expired_at, status, note)
       VALUES ('q_recovery', 'credit', ?, 'key_recovery', 'drill-model', 250,
               ?, ?, 'quarantined', 'drill quarantine')`,
    )
    .run(RECOVERY_USER, NOW, EXPIRES);

  await db
    .prepare(
      `INSERT INTO billing_events (id, type, processed_at)
       VALUES ('evt_recovery', 'checkout.session.completed', ?)`,
    )
    .run(NOW);
}

async function seedShowcase(db) {
  const bytes = Buffer.from(SHOWCASE_ARTIFACT, "utf8");

  await db
    .prepare(
      `INSERT INTO showcase.sources
        (id, kind, label, base_url, revision, enabled, max_storage_bytes,
         created_at, updated_at)
       VALUES (?, 'pelican_sdf', 'Recovery Showcase',
               'https://example.test/pelican/', 'recovery-revision', 1,
               67108864, ?, ?)`,
    )
    .run(SHOWCASE_SOURCE, NOW, NOW);
  await db
    .prepare(
      `INSERT INTO showcase.assets
        (id, source_id, sha256, mime, kind, bytes, byte_size, created_at)
       VALUES (?, ?, ?, 'text/javascript; charset=utf-8', 'artifact', ?, ?, ?)`,
    )
    .run(SHOWCASE_ASSET, SHOWCASE_SOURCE, SHOWCASE_SHA, bytes, bytes.length, NOW);
  await db
    .prepare(
      `INSERT INTO showcase.builds
        (id, source_id, external_id, visibility, created_at, updated_at)
       VALUES (?, ?, 'recovery-run', 'published', ?, ?)`,
    )
    .run(SHOWCASE_BUILD, SHOWCASE_SOURCE, NOW, NOW);
  await db
    .prepare(
      `INSERT INTO showcase.revisions
        (id, build_id, revision_key, source_id, source_url, source_revision,
         title, description, original_model_id, original_model_label, creator,
         provider, task, effort, harness, source_status, validation_state,
         source_created_at, prompt_text, prompt_sha256, raw_record_json,
         raw_record_sha256, cost_usd_micros, generation_ms, artifact_asset_id,
         thumbnail_asset_id, license_text, license_sha256, created_at)
       VALUES (?, ?, 'recovery-key', ?, 'https://example.test/run',
               'recovery-revision', 'Recovery run', '', 'recovery-model',
               'Recovery model', 'Recovery creator', 'Recovery provider',
               'one-shot', 'high', 'drill', 'unverified', 'passed', ?, 'prompt',
               ?, '{}', ?, NULL, NULL, ?, NULL, 'MIT License', ?, ?)`,
    )
    .run(
      SHOWCASE_REVISION,
      SHOWCASE_BUILD,
      SHOWCASE_SOURCE,
      NOW,
      sha256Hex("prompt"),
      sha256Hex("{}"),
      SHOWCASE_ASSET,
      sha256Hex("MIT License"),
      NOW,
    );
  await db
    .prepare(
      "UPDATE showcase.builds SET published_revision_id = ? WHERE id = ?",
    )
    .run(SHOWCASE_REVISION, SHOWCASE_BUILD);
}

/** Rewrites one row in a table's dump file without touching the manifest. */
function tamperRow(directory, schema, table, predicate, change) {
  const path = join(directory, `${schema}.${table}.jsonl`);
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const rewritten = lines.map((line) => {
    const row = JSON.parse(line);

    if (!predicate(row)) return line;

    change(row);

    return JSON.stringify(row);
  });

  writeFileSync(path, `${rewritten.join("\n")}\n`);
}

async function restoreInto(directory, dump, options = {}) {
  const db = await createStorageDatabase({ env: {}, localDirectory: directory });

  try {
    const receipt = await restoreDatabase(db, dump, options);

    return { db, receipt };
  } catch (error) {
    await db.close();

    throw error;
  }
}

const workspace = mkdtempSync(join(tmpdir(), "gateway-recovery-drill-"));

try {
  const sourceDirectory = join(workspace, "source");
  const dumpDirectory = join(workspace, "dump");
  const source = await createStorageDatabase({
    env: {},
    localDirectory: sourceDirectory,
  });

  await seed(source);
  await seedShowcase(source);

  const { manifest } = await dumpDatabase(source, dumpDirectory);

  check(
    "dump covers the ledger and payment tables",
    ["users", "credit_ledger", "credit_holds", "topups", "billing_events"].every(
      (table) =>
        manifest.tables.some(
          (entry) => entry.schema === "public" && entry.table === table,
        ),
    ),
  );
  check(
    "dump covers the content, identity and showcase schemas",
    [
      "content.sources",
      "identity.protocols",
      "showcase.assets",
      "showcase.revisions",
      "showcase.builds",
    ].every((name) =>
      manifest.tables.some((entry) => `${entry.schema}.${entry.table}` === name),
    ),
  );
  check(
    "dump verifies every balance",
    manifest.balance.users === 3 && manifest.balance.mismatches === 0,
    `${manifest.balance.users} users, ${manifest.balance.mismatches} mismatches`,
  );

  await source.close();
  rmSync(sourceDirectory, { recursive: true, force: true });

  check("the source database was destroyed", !existsSync(sourceDirectory));

  const { db: restored, receipt } = await restoreInto(
    join(workspace, "restored"),
    dumpDirectory,
  );
  const restoredRows = receipt.tables.find(
    (entry) => entry.schema === "public" && entry.table === "users",
  );

  check("restore reports the dumped tables", restoredRows?.rows === 3);
  check("restore verifies every balance", receipt.balance.mismatches === 0);

  const credit = await availableCredit(restored, RECOVERY_USER);

  check(
    "the restored balance is spendable",
    credit?.creditMicros === 5000 &&
      credit?.heldMicros === 250 &&
      credit?.availableMicros === 4750,
    JSON.stringify(credit),
  );

  const ledger = await restored
    .prepare(
      `SELECT COALESCE(SUM(amount_micros), 0) AS total
         FROM credit_ledger WHERE user_id = ?`,
    )
    .get(RECOVERY_USER);

  check(
    "the restored ledger still reconstructs the balance",
    Number(ledger.total) === 5000,
    String(ledger.total),
  );

  const pending = await restored.prepare(
    "SELECT COUNT(*) AS count FROM settlements WHERE status = 'admitted'",
  ).get();

  check("unresolved settlements survive", Number(pending.count) === 1);

  const showcaseAsset = await restored
    .prepare(
      `SELECT sha256, byte_size, encode(bytes, 'hex') AS hex
         FROM showcase.assets WHERE id = ?`,
    )
    .get(SHOWCASE_ASSET);
  const restoredArtifact = Buffer.from(showcaseAsset?.hex ?? "", "hex");

  check(
    "the restored showcase asset bytes match",
    showcaseAsset?.sha256 === SHOWCASE_SHA &&
      Number(showcaseAsset?.byte_size) ===
        Buffer.byteLength(SHOWCASE_ARTIFACT, "utf8") &&
      restoredArtifact.toString("utf8") === SHOWCASE_ARTIFACT,
    showcaseAsset?.sha256 ?? "missing",
  );

  const showcaseRevision = await restored
    .prepare(
      `SELECT r.title, r.artifact_asset_id, b.visibility,
              b.published_revision_id
         FROM showcase.revisions r
         JOIN showcase.builds b ON b.id = r.build_id
        WHERE r.id = ?`,
    )
    .get(SHOWCASE_REVISION);

  check(
    "the restored showcase revision keeps its artifact and publication",
    showcaseRevision?.title === "Recovery run" &&
      showcaseRevision?.artifact_asset_id === SHOWCASE_ASSET &&
      showcaseRevision?.visibility === "published" &&
      showcaseRevision?.published_revision_id === SHOWCASE_REVISION,
    JSON.stringify(showcaseRevision ?? null),
  );

  let replayError = null;

  try {
    await restored
      .prepare(
        "INSERT INTO billing_events (id, type, processed_at) VALUES ('evt_recovery', 'replay', ?)",
      )
      .run(NOW);
  } catch (error) {
    replayError = error;
  }

  check(
    "a restored payment event cannot be replayed",
    replayError?.code === "23505",
    replayError?.code ?? "no error",
  );

  await restored.close();

  const tampered = join(workspace, "tampered");

  cpSync(dumpDirectory, tampered, { recursive: true });
  tamperRow(tampered, "public", "credit_ledger", (row) => row.kind === "usage", (row) => {
    row.amount_micros = "-1";
  });

  const tamperedDb = await createStorageDatabase({
    env: {},
    localDirectory: join(workspace, "tampered-restore"),
  });
  let tamperedError = null;

  try {
    await restoreDatabase(tamperedDb, tampered);
  } catch (error) {
    tamperedError = error;
  }

  check(
    "a tampered dump is refused",
    tamperedError instanceof BackupRefused &&
      /does not match/.test(tamperedError.message),
    tamperedError?.message ?? "no error",
  );

  const tamperedUsers = await tamperedDb
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get();

  check(
    "a refused restore leaves its target untouched",
    Number(tamperedUsers.count) === 1,
    `${tamperedUsers.count} users`,
  );

  await tamperedDb.close();

  const shortDir = join(workspace, "short");

  cpSync(dumpDirectory, shortDir, { recursive: true });

  const shortPath = join(shortDir, "public.topups.jsonl");
  const shortLines = readFileSync(shortPath, "utf8").split("\n").filter(Boolean);

  writeFileSync(shortPath, `${shortLines.slice(0, -1).join("\n")}\n`);

  let shortError = null;

  try {
    await restoreInto(join(workspace, "short-restore"), shortDir);
  } catch (error) {
    shortError = error;
  }

  check(
    "a truncated table is refused",
    shortError instanceof BackupRefused &&
      /manifest says/.test(shortError.message),
    shortError?.message ?? "no error",
  );

  if (failures > 0) {
    console.error(`recovery-drill: FAIL ${failures} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("recovery-drill: PASS (dump, restore, replay and refusals)");
  }
} catch (error) {
  console.error(
    `recovery-drill FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
