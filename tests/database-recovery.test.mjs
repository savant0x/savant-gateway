import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import Database from "better-sqlite3";

import { ensureColumn } from "../lib/schema/columns.ts";

const execFileAsync = promisify(execFile);
const repo = process.cwd();
const NOW = "2026-10-31T00:00:00.000Z";

function createFixture(path) {
  const database = new Database(path);

  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      credit_micros INTEGER NOT NULL DEFAULT 0,
      held_micros INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      secret_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      balance_after_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      reference TEXT
    );
    CREATE TABLE credit_holds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      model_id TEXT NOT NULL,
      hold_micros INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE topups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_ref TEXT NOT NULL UNIQUE,
      amount_micros INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      api_key_id TEXT,
      model_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      weighted_tokens INTEGER NOT NULL DEFAULT 0,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      charged_micros INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE settlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      billing_source TEXT NOT NULL,
      estimated_micros INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'admitted',
      created_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE TABLE quarantined_holds (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      model_id TEXT,
      reserved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expired_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'quarantined',
      released_at TEXT,
      note TEXT
    );
    CREATE TABLE billing_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processed',
      attempts INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE balance_baselines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      baseline_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    INSERT INTO users VALUES
      ('user_a', 'a@example.test', 'A', 'active', '${NOW}', 400, 50),
      ('user_b', 'b@example.test', 'B', 'active', '${NOW}', 0, 0);
    INSERT INTO api_keys VALUES
      ('key_a', 'user_a', 'A', 'sg_a', 'sha256:a', 'active', '${NOW}');
    INSERT INTO models VALUES ('model', 'Model');
    INSERT INTO credit_ledger VALUES
      ('ledger_1', 'user_a', 'topup', 500, 500, 'top-up', '${NOW}', NULL),
      ('ledger_2', 'user_a', 'usage', -100, 400, 'usage', '${NOW}', NULL);
    INSERT INTO credit_holds VALUES
      ('hold_1', 'user_a', 'key_a', 'model', 50, '${NOW}', '${NOW}');
    INSERT INTO topups VALUES
      ('topup_1', 'user_a', 'stripe', 'cs_1', 500, 'usd', 'paid', '${NOW}', '${NOW}');
    INSERT INTO usage_events
      (id, user_id, api_key_id, model_id, charged_micros, status, created_at)
      VALUES ('usage_1', 'user_a', 'key_a', 'model', 100, 'ok', '${NOW}');
    INSERT INTO settlements VALUES
      ('stl_1', 'user_a', 'key_a', 'model', 'mock', 'credit', 100, 'committed', '${NOW}', '${NOW}'),
      ('stl_2', 'user_a', 'key_a', 'model', 'mock', 'credit', 100, 'admitted', '${NOW}', NULL);
    INSERT INTO quarantined_holds VALUES
      ('q_1', 'credit', 'user_a', 'key_a', 'model', 50, '${NOW}', '${NOW}', 'quarantined', NULL, NULL);
    INSERT INTO billing_events VALUES
      ('evt_1', 'checkout.session.completed', '${NOW}', 'processed', 1);
    INSERT INTO balance_baselines VALUES
      ('baseline_1', 'user_a', 0, 'opening', '${NOW}');
  `);

  return database;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function run(args, env = {}) {
  return execFileAsync(process.execPath, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function expectFailure(args, env, pattern) {
  let failure = null;

  try {
    await run(args, env);
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, "expected the command to fail");

  const text = `${failure.stderr ?? ""}\n${failure.stdout ?? ""}\n${failure.message ?? ""}`;

  assert.match(text, pattern);
}

async function expectExitCode(args, env, expected) {
  let failure = null;

  try {
    await run(args, env);
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, "expected the command to fail");
  assert.equal(failure.code, expected);
}

test("an online backup restores a reconciled ledger and payment history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-recovery-"));
  const source = join(directory, "gateway.db");
  const backupDirectory = join(directory, "backups");
  const restored = join(directory, "restored.db");

  try {
    const database = createFixture(source);

    let writes = 0;
    let errors = 0;
    const writer = database.prepare(
      `INSERT INTO usage_events (id, user_id, model_id, status, created_at)
       VALUES (?, 'user_b', 'model', 'ok', ?)`,
    );
    const timer = setInterval(() => {
      try {
        writer.run(`writer_${writes}`, new Date().toISOString());
        writes += 1;
      } catch {
        errors += 1;
      }
    }, 2);

    try {
      await run(["scripts/db-backup.mjs"], {
        DB_PATH: source,
        BACKUP_DIR: backupDirectory,
        BACKUP_RETENTION: "3",
      });
    } finally {
      clearInterval(timer);
      database.close();
    }

    assert.equal(errors, 0);
    assert.ok(writes > 0, "the writer should have run during the backup");

    const files = (await readdir(backupDirectory)).filter((name) =>
      name.endsWith(".db"),
    );

    assert.equal(files.length, 1);

    const backupPath = join(backupDirectory, files[0]);
    const metadata = JSON.parse(await readFile(`${backupPath}.json`, "utf8"));
    const backupHash = await sha256(backupPath);

    assert.equal(metadata.format, "savant-backup/1");
    assert.equal(metadata.integrity, "ok");
    assert.equal(metadata.sha256, backupHash);
    assert.equal(metadata.bytes, (await stat(backupPath)).size);

    const sourceHash = await sha256(source);

    await run(["scripts/db-restore.mjs", "--backup", backupPath, "--target", restored]);

    assert.equal(await sha256(source), sourceHash, "the live file must not change");

    const receipt = JSON.parse(await readFile(`${restored}.restore.json`, "utf8"));

    assert.equal(receipt.verified, true);
    assert.equal(receipt.integrity, "ok");
    assert.equal(receipt.financial.balance_micros, 400);
    assert.equal(receipt.financial.ledger_micros, 400);
    assert.equal(receipt.financial.balanced, true);
    assert.equal(receipt.financial.unresolved_settlements, 1);
    assert.equal(receipt.financial.quarantined_holds, 1);
    assert.equal(receipt.counts.users, 2);
    assert.equal(receipt.counts.billing_events, 1);
    assert.equal(receipt.counts.settlements, 2);

    const copy = new Database(restored, { readonly: true });

    try {
      assert.equal(copy.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(
        copy.prepare("SELECT credit_micros FROM users WHERE id = 'user_a'").get()
          .credit_micros,
        400,
      );
      assert.equal(
        copy.prepare("SELECT COUNT(*) AS total FROM billing_events").get().total,
        1,
      );
    } finally {
      copy.close();
    }

    // A restored payment history must reject a replayed event rather than
    // credit the same top-up twice. The webhook claim table is the first line;
    // the provider reference unique constraint is the last.
    const replay = new Database(restored);

    try {
      assert.throws(
        () =>
          replay
            .prepare(
              `INSERT INTO billing_events (id, type, processed_at)
               VALUES ('evt_1', 'checkout.session.completed', ?)`,
            )
            .run(new Date().toISOString()),
        /UNIQUE/,
      );
      assert.throws(
        () =>
          replay
            .prepare(
              `INSERT INTO topups
                (id, user_id, provider_ref, amount_micros, status, created_at)
               VALUES ('topup_replay', 'user_a', 'cs_1', 500, 'paid', ?)`,
            )
            .run(new Date().toISOString()),
        /UNIQUE/,
      );
      assert.equal(
        replay.prepare("SELECT credit_micros FROM users WHERE id = 'user_a'").get()
          .credit_micros,
        400,
        "a rejected replay must not change the balance",
      );
    } finally {
      replay.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("restore refuses an existing target, the live path and a tampered checksum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-recovery-"));

  try {
    const source = join(directory, "gateway.db");
    const database = createFixture(source);

    database.close();

    const backupDirectory = join(directory, "backups");

    await run(["scripts/db-backup.mjs"], {
      DB_PATH: source,
      BACKUP_DIR: backupDirectory,
    });

    const files = (await readdir(backupDirectory)).filter((name) =>
      name.endsWith(".db"),
    );
    const backupPath = join(backupDirectory, files[0]);
    const existing = join(directory, "existing.db");

    await writeFile(existing, "not a database");

    await expectFailure(
      ["scripts/db-restore.mjs", "--backup", backupPath, "--target", existing],
      {},
      /target already exists/,
    );

    const liveTarget = join(directory, "live.db");

    await expectFailure(
      ["scripts/db-restore.mjs", "--backup", backupPath, "--target", liveTarget],
      { DB_PATH: liveTarget },
      /live DB_PATH/,
    );

    const tampered = join(directory, "tampered.db");
    const tamperedSidecar = `${tampered}.json`;

    await copyFile(backupPath, tampered);
    await copyFile(`${backupPath}.json`, tamperedSidecar);

    const sidecar = JSON.parse(await readFile(tamperedSidecar, "utf8"));
    const bytes = await readFile(tampered);

    bytes[100] = bytes[100] ^ 0xff;
    await writeFile(tampered, bytes);

    const metadata = {
      ...sidecar,
      file: basename(tampered),
      bytes: bytes.length,
    };
    await writeFile(tamperedSidecar, `${JSON.stringify(metadata, null, 2)}\n`);

    const tamperedTarget = join(directory, "tampered-restored.db");

    await expectFailure(
      ["scripts/db-restore.mjs", "--backup", tampered, "--target", tamperedTarget],
      {},
      /checksum mismatch/,
    );

    await assert.rejects(readFile(tamperedTarget));
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("a legacy backup without a sidecar needs explicit consent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-recovery-"));

  try {
    const source = join(directory, "gateway.db");
    const database = createFixture(source);

    database.close();

    const backupDirectory = join(directory, "backups");

    await run(["scripts/db-backup.mjs"], {
      DB_PATH: source,
      BACKUP_DIR: backupDirectory,
    });

    const files = (await readdir(backupDirectory)).filter((name) =>
      name.endsWith(".db"),
    );
    const backupPath = join(backupDirectory, files[0]);

    await rename(`${backupPath}.json`, `${backupPath}.json.off`);

    const target = join(directory, "restored.db");

    await expectFailure(
      ["scripts/db-restore.mjs", "--backup", backupPath, "--target", target],
      {},
      /metadata missing/,
    );

    await run(
      [
        "scripts/db-restore.mjs",
        "--backup",
        backupPath,
        "--target",
        target,
        "--allow-unverified",
      ],
      {},
    );

    const receipt = JSON.parse(await readFile(`${target}.restore.json`, "utf8"));

    assert.equal(receipt.verified, false);
    assert.equal(receipt.allow_unverified, true);
    assert.equal(receipt.financial.balanced, true);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("a process interruption cannot leave an uncommitted write visible", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-recovery-"));

  try {
    const source = join(directory, "gateway.db");
    const database = createFixture(source);
    const helper = join(directory, "interrupt.mjs");

    database.close();

    await writeFile(
      helper,
      `import { createRequire } from "node:module";
const require = createRequire(process.argv[2]);
const Database = require("better-sqlite3");
const database = new Database(process.argv[3]);
database.pragma("journal_mode = WAL");
database.exec("BEGIN IMMEDIATE");
database.prepare("INSERT INTO usage_events (id, user_id, status, created_at) VALUES ('interrupted', 'user_b', 'ok', ?)").run(new Date().toISOString());
process.exit(1);
`,
    );

    await expectExitCode([helper, join(repo, "package.json"), source], {}, 1);

    const reopened = new Database(source);

    try {
      assert.equal(reopened.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(
        reopened
          .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE id = 'interrupted'")
          .get().total,
        0,
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("a restored copy accepts an additive migration without losing rows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-recovery-"));

  try {
    const source = join(directory, "gateway.db");
    const database = createFixture(source);

    database.close();

    const backupDirectory = join(directory, "backups");

    await run(["scripts/db-backup.mjs"], {
      DB_PATH: source,
      BACKUP_DIR: backupDirectory,
    });

    const files = (await readdir(backupDirectory)).filter((name) =>
      name.endsWith(".db"),
    );
    const backupPath = join(backupDirectory, files[0]);
    const restored = join(directory, "restored.db");

    await run(["scripts/db-restore.mjs", "--backup", backupPath, "--target", restored]);

    const copy = new Database(restored);

    try {
      ensureColumn(copy, "users", "email_verified_at", "TEXT");
      ensureColumn(copy, "users", "email_verified_at", "TEXT");
      ensureColumn(copy, "models", "family", "TEXT");

      const columns = copy.prepare("PRAGMA table_info(users)").all();
      const family = copy.prepare("PRAGMA table_info(models)").all();

      assert.equal(
        columns.filter((column) => column.name === "email_verified_at").length,
        1,
      );
      assert.equal(family.filter((column) => column.name === "family").length, 1);
      assert.equal(
        copy.prepare("SELECT email FROM users WHERE id = 'user_a'").get().email,
        "a@example.test",
      );
      assert.equal(
        copy.prepare("SELECT name FROM models WHERE id = 'model'").get().name,
        "Model",
      );
    } finally {
      copy.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5 });
  }
});
