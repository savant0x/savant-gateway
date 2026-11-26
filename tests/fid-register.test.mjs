import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkFidRegister, closureCommits } from "../scripts/fid-register.mjs";

test("reads historical closure labels and ignores a design baseline", () => {
  const text = [
    "- **Commit/State:** `0123456`",
    "- [x] **Commit SHA:** `1234567`",
    "- **Commit SHAs:** `2345678` and",
    "  `3456789`",
    "Implementation commit `456789a`.",
    "Closed against `56789ab`.",
  ].join("\n");
  assert.deepEqual(closureCommits(text), ["1234567", "2345678", "3456789", "456789a", "56789ab"]);
});

test("reports queue, link, scope, changelog and closure failures", (context) => {
  const root = mkdtempSync(join(tmpdir(), "gateway-fid-register-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "dev/fids/archive"), { recursive: true });
  const active = "FID-2026-1126-001";
  const archived = "FID-2026-1126-002";
  const metadata = (id, status) =>
    "**Filename:** " + id + "-example.md\n" +
    "**ID:** " + id + "\n**Status:** " + status + "\n" +
    "**Severity:** medium\n**Created:** 2026-11-26\n";
  writeFileSync(join(root, "SCOPE.md"), active + "-LIVE\n");
  writeFileSync(join(root, "CHANGELOG.md"), archived + "-LIVE\n");
  writeFileSync(
    join(root, "dev/fids/README.md"),
    "| [001](" + active + "-example.md) | Example | converged | Verify |\n",
  );
  writeFileSync(
    join(root, "dev/fids", active + "-example.md"),
    metadata(active, "fixed") + "[missing](missing.md)\n",
  );
  writeFileSync(
    join(root, "dev/fids/archive", archived + "-example.md"),
    metadata(archived, "closed") + "\n## Resolution\n- **Commit/State:** `0123456`\n",
  );
  const result = checkFidRegister(root);
  assert.equal(result.active, 1);
  assert.equal(result.errors.length, 5);
  for (const message of ["active queue row", "broken Markdown link", "SCOPE.md", "CHANGELOG.md", "closure commit"]) {
    assert.ok(result.errors.some((error) => error.includes(message)), message);
  }
});
