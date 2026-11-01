import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("the storage contract is green: one engine and no SQLite importers", () => {
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "storage-contract-check.mjs")],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.trim(),
  );
  assert.match(result.stdout, /PASS — one storage engine/);
  assert.match(result.stdout, /handle importers under app\/, lib\/: 0/);
});
