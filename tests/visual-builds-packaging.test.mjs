import assert from "node:assert/strict";
import test from "node:test";

import {
  packagePelicanArtifact,
  visualBuildBundleEtag,
} from "../lib/visual-builds/packaging.ts";

test("the packager refuses a non-Pelican module and escapes closing script tags", () => {
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
  assert.equal(visualBuildBundleEtag(packaged.sha256), `"vb-${packaged.sha256.slice(0, 32)}"`);
});

test("the packager keeps the original artifact text distinct from the wrapper", () => {
  const artifact =
    "export function createPelicanSdf(canvas) { canvas.dataset.original = 'yes'; }";
  const packaged = packagePelicanArtifact(artifact);

  assert.notEqual(packaged.sha256, artifact);
  assert.match(packaged.html, /createPelicanSdf/);
  assert.match(packaged.html, /default-src 'none'/);
});
