import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("the USDC receive spike runs with declared dependencies and six checks", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  for (const name of ["@scure/bip32", "@noble/hashes", "@noble/curves"]) {
    assert.equal(
      pkg.dependencies?.[name],
      "2.4.0",
      `${name} must stay a declared exact dependency`,
    );
    assert.equal(
      pkg.devDependencies?.[name],
      undefined,
      `${name} must not be dev-only: lib/crypto imports it at runtime`,
    );
  }

  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "usdc-receive-spike.mjs")],
    { cwd: root, encoding: "utf8", timeout: 60_000 },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.trim());

  const passes = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("PASS "));

  assert.equal(passes.length, 6, result.stdout);
  assert.match(result.stdout, /usdc-receive-spike: 6\/6 checks pass/);
});
