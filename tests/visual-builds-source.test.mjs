import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizeModelKey } from "../lib/benchmarks.ts";
import {
  fetchPelicanSnapshot,
  loadPelicanFixture,
  parsePelicanManifest,
  parsePelicanResult,
  pelicanFixtureSource,
  verifyPelicanFiles,
} from "../lib/visual-builds/pelican.ts";
import { packagePelicanArtifact } from "../lib/visual-builds/packaging.ts";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "pelican");
const RESULT = "results/gpt-6-1-sol-high-run-01.json";
const SOURCE = pelicanFixtureSource();

test("the pinned Pelican record verifies its prompt, artifact, thumbnail and license", async () => {
  const snapshot = await loadPelicanFixture(ROOT, SOURCE, RESULT);

  assert.equal(snapshot.record.externalId, "gpt-6-1-sol-high-run-01");
  assert.equal(snapshot.record.originalModelId, "gpt-6.1-sol");
  assert.equal(snapshot.promptSha256, snapshot.record.promptSha256);
  assert.equal(snapshot.artifactSha256, snapshot.record.artifactSha256);
  assert.equal(snapshot.thumbnailBytes?.[0], 0xff);
  assert.equal(snapshot.thumbnailBytes?.[1], 0xd8);
  assert.match(snapshot.licenseText, /MIT License/);
  assert.match(
    new TextDecoder().decode(snapshot.artifactBytes),
    /export function createPelicanSdf/,
  );
});

test("manifest and result parsing reject traversal, duplicates and wrong hashes", async () => {
  assert.throws(
    () => parsePelicanManifest(JSON.stringify(["../secret.json"])),
    /unsafe path/,
  );
  assert.throws(
    () =>
      parsePelicanManifest(
        JSON.stringify([RESULT, RESULT]),
      ),
    /repeats/,
  );
  assert.throws(
    () =>
      parsePelicanResult(
        JSON.stringify({ ...JSON.parse(awaitFixture()), id: "../x" }),
        RESULT,
      ),
    /not safe/,
  );

  const snapshot = await loadPelicanFixture(ROOT, SOURCE, RESULT);
  const tampered = Buffer.from(snapshot.artifactBytes);

  tampered[tampered.length - 1] ^= 1;

  await assert.rejects(
    async () =>
      verifyPelicanFiles(
        SOURCE,
        RESULT,
        snapshot.rawRecordJson,
        snapshot.promptText,
        tampered,
        snapshot.thumbnailBytes,
        snapshot.licenseText,
      ),
    /artifact hash/,
  );
});

function awaitFixture() {
  return readFileSync(path.join(ROOT, RESULT), "utf8");
}

test("strict matching keeps the free prefix while benchmark matching folds it", () => {
  assert.equal(normalizeModelKey("free/claude-opus-4.6"), "claude-opus-4-6");
  assert.equal(
    normalizeModelKey("free/claude-opus-4.6", { preserveFreePrefix: true }),
    "free/claude-opus-4-6",
  );
});

test("the packager refuses a non-Pelican module and escapes closing script tags", async () => {
  assert.throws(
    () => packagePelicanArtifact("export const nope = 1;"),
    /createPelicanSdf/,
  );

  const packaged = packagePelicanArtifact(
    `export function createPelicanSdf(canvas) { canvas.title = "</script><img src=x>"; }`,
  );

  assert.match(packaged.html, /connect-src 'none'/);
  assert.match(packaged.html, /frame-ancestors 'self'/);
  assert.equal((packaged.html.match(/<\/script>/g) ?? []).length, 1);
  assert.equal(packaged.sha256.length, 64);
});

test("the network adapter stores nothing when the source cannot be reached", async () => {
  const source = pelicanFixtureSource({
    baseUrl: "https://127.0.0.1:1/",
  });

  await assert.rejects(
    async () => fetchPelicanSnapshot(source, RESULT),
    /public|refused|fetch|connect|port/i,
  );
});
