import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

import { Client } from "pg";

import {
  DISPOSABLE_POSTGRES_VERSION,
  OWNERSHIP_MARKER,
  assertDisposableEndpoint,
  ensureScratchRoot,
  postgresPackage,
  readOwnershipMarker,
  removeOwnedRunDirectory,
  startDisposablePostgres,
} from "../scripts/disposable-postgres.mjs";

const SCRATCH_PARENT = join(process.cwd(), ".scratch");

function scratchRootForTest() {
  mkdirSync(SCRATCH_PARENT, { recursive: true });

  return mkdtempSync(join(SCRATCH_PARENT, "pg-test-"));
}

function ownsMarker(directory, runId) {
  writeFileSync(
    join(directory, OWNERSHIP_MARKER),
    `${JSON.stringify({ runId, pid: process.pid })}\n`,
  );
}

function runDirectories(root) {
  const { readdirSync } = process.getBuiltinModule("node:fs");

  return readdirSync(root).filter((entry) => entry.startsWith("run-")).sort();
}

test("the platform package is pinned and an unsupported target is refused", () => {
  assert.equal(
    postgresPackage({ platform: "win32", arch: "x64" }).name,
    "@embedded-postgres/windows-x64",
  );
  assert.equal(
    postgresPackage({ platform: "linux", arch: "x64" }).name,
    "@embedded-postgres/linux-x64",
  );
  assert.equal(
    postgresPackage({ platform: "linux", arch: "x64" }).version,
    DISPOSABLE_POSTGRES_VERSION,
  );
  assert.throws(
    () => postgresPackage({ platform: "darwin", arch: "arm64" }),
    /no pinned native PostgreSQL .* for darwin\/arm64; supported: win32-x64, linux-x64/,
  );
});

test("endpoint validation refuses the application URL, foreign protocols and unapproved remote hosts", () => {
  const previous = process.env.DATABASE_URL;

  try {
    process.env.DATABASE_URL = "postgres://app@db.example.com/app";

    assert.throws(
      () =>
        assertDisposableEndpoint(
          "postgres://app@db.example.com/app",
          "TEST_DATABASE_URL",
        ),
      /must not equal DATABASE_URL/,
    );
    assert.throws(
      () => assertDisposableEndpoint("mysql://127.0.0.1/db", "TEST_DATABASE_URL"),
      /must be a postgres:\/\//,
    );
    assert.throws(
      () =>
        assertDisposableEndpoint(
          "postgres://gateway:secret@db.example.com/disposable",
          "TEST_DATABASE_URL",
        ),
      /refusing non-loopback/,
    );
    assert.doesNotThrow(() =>
      assertDisposableEndpoint(
        "postgres://gateway:secret@db.example.com/disposable",
        "TEST_DATABASE_URL",
        { allowRemote: true },
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("a foreign directory is never deleted", () => {
  const root = scratchRootForTest();
  const foreign = mkdtempSync(join(root, "run-"));
  const sentinel = join(foreign, "keep.txt");

  try {
    writeFileSync(sentinel, "unrelated data\n");

    assert.throws(
      () =>
        removeOwnedRunDirectory(foreign, {
          scratchRoot: root,
          runId: "not-this-run",
        }),
      /not owned by this run/,
    );
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a mismatched ownership marker is refused and the data survives", () => {
  const root = scratchRootForTest();
  const directory = mkdtempSync(join(root, "run-"));

  try {
    ownsMarker(directory, "run-a");
    writeFileSync(join(directory, "keep.txt"), "owned by run-a\n");

    assert.throws(
      () =>
        removeOwnedRunDirectory(directory, {
          scratchRoot: root,
          runId: "run-b",
        }),
      /marker names run run-a, not run-b/,
    );
    assert.equal(readOwnershipMarker(directory).runId, "run-a");
    assert.equal(existsSync(join(directory, "keep.txt")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a symlinked run directory is refused even when it carries a marker", () => {
  const root = scratchRootForTest();
  const outside = mkdtempSync(join(tmpdir(), "savant-pg-outside-"));
  const link = join(root, "run-link");
  const sentinel = join(outside, "keep.txt");

  try {
    ownsMarker(outside, "run-link");
    writeFileSync(sentinel, "outside the scratch root\n");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    assert.throws(
      () =>
        removeOwnedRunDirectory(link, {
          scratchRoot: root,
          runId: "run-link",
        }),
      /symlink|outside|not owned/,
    );
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("one run starts a real cluster, serves two connections and cleans up", async () => {
  const root = scratchRootForTest();
  const unrelated = mkdtempSync(join(root, "unrelated-"));

  try {
    const handle = await startDisposablePostgres({ scratchRoot: root });
    const first = new Client({ connectionString: handle.connectionString });
    const second = new Client({ connectionString: handle.connectionString });

    try {
      await first.connect();
      await second.connect();

      const [directory, other] = await Promise.all([
        first.query("SELECT current_setting('data_directory') AS value"),
        second.query("SELECT current_user AS value"),
      ]);

      assert.equal(
        directory.rows[0].value.replaceAll("\\", "/").toLowerCase(),
        handle.dataDirectory.replaceAll("\\", "/").toLowerCase(),
      );
      assert.equal(other.rows[0].value, "gateway");
    } finally {
      await first.end().catch(() => undefined);
      await second.end().catch(() => undefined);
    }

    const cleanup = handle.close();

    assert.deepEqual(cleanup, { ok: true });
    assert.equal(existsSync(handle.runDirectory), false);
    assert.equal(existsSync(unrelated), true);
    assert.deepEqual(handle.close(), { ok: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two parallel runs use distinct directories and ports", async () => {
  const root = scratchRootForTest();
  const handles = [];

  try {
    const [first, second] = await Promise.all([
      startDisposablePostgres({ scratchRoot: root }),
      startDisposablePostgres({ scratchRoot: root }),
    ]);

    handles.push(first, second);
    assert.notEqual(first.port, second.port);
    assert.notEqual(first.runDirectory, second.runDirectory);
    assert.equal(existsSync(first.dataDirectory), true);
    assert.equal(existsSync(second.dataDirectory), true);

    for (const handle of handles) {
      const client = new Client({ connectionString: handle.connectionString });

      try {
        await client.connect();
        assert.equal((await client.query("SELECT 1 AS ok")).rows[0].ok, 1);
      } finally {
        await client.end().catch(() => undefined);
      }
    }
  } finally {
    for (const handle of handles) handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("an occupied port fails startup, cleans its run directory and leaves the listener alone", async () => {
  const root = scratchRootForTest();
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;

  try {
    assert.ok(port);

    await assert.rejects(
      startDisposablePostgres({ scratchRoot: root, port }),
      /pg_ctl start on 127\.0\.0\.1|could not bind|failed/,
    );
    assert.deepEqual(runDirectories(root), []);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});

test("the scratch root accepts the repository boundary and resolves its identity", () => {
  const root = scratchRootForTest();

  try {
    assert.equal(ensureScratchRoot(root), ensureScratchRoot(root));
    assert.match(ensureScratchRoot(root).replaceAll("\\", "/"), /\/\.scratch\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
