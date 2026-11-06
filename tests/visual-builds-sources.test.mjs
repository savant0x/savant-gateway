import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  fetchPelicanSnapshot,
  loadPelicanFixture,
  parsePelicanManifest,
  parsePelicanResult,
  pelicanFixtureSource,
  verifyPelicanFiles,
} from "../lib/visual-builds/pelican.ts";

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
    () => parsePelicanManifest(JSON.stringify([RESULT, RESULT])),
    /repeats/,
  );
  assert.throws(
    () =>
      parsePelicanResult(
        JSON.stringify({ ...JSON.parse(readFileSync(path.join(ROOT, RESULT), "utf8")), id: "../x" }),
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

test("a source without a published record is refused rather than scanned", async () => {
  await assert.rejects(
    async () => loadPelicanFixture(ROOT, SOURCE, "results/not-published.json"),
    /manifest|not found|ENOENT/i,
  );
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
