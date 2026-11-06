import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  loadOpenRouterFixture,
  openRouterFixtureSource,
  parseOpenRouterManifest,
  verifyOpenRouterFiles,
} from "../lib/visual-builds/openrouter.ts";
import { packageOpenRouterArtifact } from "../lib/visual-builds/packaging.ts";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "openrouter");
const SOURCE = openRouterFixtureSource();
const RECORD = "gpt-6-1-sol-game-run-01";

test("the pinned OpenRouter document verifies its prompt, HTML and license", async () => {
  const snapshot = await loadOpenRouterFixture(ROOT, SOURCE, RECORD);

  assert.equal(snapshot.record.externalId, RECORD);
  assert.equal(snapshot.record.originalModelId, "openai/gpt-6.1-sol");
  assert.equal(snapshot.artifactMime, "text/html; charset=utf-8");
  assert.equal(snapshot.sourceUrl, snapshot.record.documentUrl);
  assert.equal(snapshot.promptSha256, snapshot.record.promptSha256);
  assert.equal(snapshot.licenseSha256, snapshot.record.licenseSha256);
  assert.match(
    new TextDecoder().decode(snapshot.artifactBytes),
    /<canvas id="game"/,
  );
});

test("the OpenRouter packager rejects remote or non-offline documents", () => {
  assert.throws(
    () =>
      packageOpenRouterArtifact(
        "<!doctype html><html><body><canvas></canvas><script>1</script></body></html>",
      ),
    /offline CSP/,
  );
  assert.throws(
    () =>
      packageOpenRouterArtifact(
        '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"></head><body><canvas></canvas><script src="https://example.test/game.js"></script></body></html>',
      ),
    /remote asset/,
  );
  assert.throws(
    () =>
      packageOpenRouterArtifact(
        '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"></head><body><canvas></canvas><script>1</script><iframe></iframe></body></html>',
      ),
    /forbidden element/,
  );
});

test("the manifest refuses duplicate ids and non-approved asset hosts", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
  );
  const record = manifest.records[0];

  assert.throws(
    () => parseOpenRouterManifest(JSON.stringify({ records: [record, record] })),
    /repeats an id/,
  );
  assert.throws(
    () =>
      parseOpenRouterManifest(
        JSON.stringify({
          records: [
            {
              ...record,
              documentUrl: "https://example.test/game.html",
            },
          ],
        }),
      ),
    /approved asset origin/,
  );
});

test("the verifier refuses bytes that no longer match the record hashes", async () => {
  const snapshot = await loadOpenRouterFixture(ROOT, SOURCE, RECORD);
  const tampered = Buffer.from(snapshot.artifactBytes);

  tampered[tampered.length - 1] ^= 1;

  assert.throws(
    () =>
      verifyOpenRouterFiles(
        SOURCE,
        { ...snapshot.record, artifactSha256: snapshot.artifactSha256 },
        snapshot.promptText,
        tampered,
        snapshot.thumbnailBytes,
        snapshot.licenseText,
      ),
    /artifact|HTML/i,
  );
});
