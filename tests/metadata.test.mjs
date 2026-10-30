import assert from "node:assert/strict";
import test from "node:test";

import { auditSocialMetadata, readMetaTags } from "../scripts/http-suite/metadata.mjs";

const CARD = (overrides = {}) => {
  const tags = {
    "og:title": "Model catalog - Savant Gateway",
    "og:description": "Every model with its price.",
    "og:image": "https://gateway.example/models/opengraph-image?abc123",
    "og:image:width": "1200",
    "og:image:height": "630",
    "twitter:card": "summary_large_image",
    ...overrides,
  };

  return `<html><head><title>Model catalog - Savant Gateway</title>${Object.entries(tags)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `<meta property="${key}" content="${value}"/>`)
    .join("")}</head><body></body></html>`;
};

test("a complete card produces no issues", () => {
  assert.deepEqual(auditSocialMetadata(CARD()), []);
});

test("a page with no metadata at all is reported for every missing key", () => {
  const issues = auditSocialMetadata("<html><head><title>Home</title></head></html>");

  assert.equal(issues.filter((issue) => issue.startsWith("missing og:")).length, 5);
  assert.ok(issues.includes("missing twitter:card"));
});

test("a relative og:image is rejected because crawlers need an absolute url", () => {
  const issues = auditSocialMetadata(CARD({ "og:image": "/images/og.png" }));

  assert.ok(issues.some((issue) => issue.startsWith("og:image is not an absolute url")));
});

test("an og:image pointing at the site root is rejected", () => {
  const issues = auditSocialMetadata(CARD({ "og:image": "https://gateway.example/" }));

  assert.ok(issues.some((issue) => issue.startsWith("og:image points at the site root")));
});

test("a missing og:image reports that key and skips the url rules", () => {
  const issues = auditSocialMetadata(CARD({ "og:image": null }));

  assert.deepEqual(issues, ["missing og:image"]);
});

test("dimensions are required so a platform can reserve space", () => {
  assert.deepEqual(auditSocialMetadata(CARD({ "og:image:width": null })), [
    "missing og:image:width",
  ]);
});

test("a small twitter card is reported rather than accepted", () => {
  const issues = auditSocialMetadata(CARD({ "twitter:card": "summary" }));

  assert.deepEqual(issues, ['twitter:card is "summary"']);
});

test("a page with no title tag is reported", () => {
  const html = CARD().replace("<title>Model catalog - Savant Gateway</title>", "");

  assert.ok(auditSocialMetadata(html).includes("no <title>"));
});

test("the parser keys by property or name, decodes entities, and keeps the first tag", () => {
  const html = [
    '<meta name="twitter:card" content="summary_large_image"/>',
    '<meta property="og:image" content="https://gateway.example/a.png?x=1&amp;y=2"/>',
    '<meta property="og:image" content="https://gateway.example/second.png"/>',
  ].join("");

  const tags = readMetaTags(html);

  assert.equal(tags.get("twitter:card"), "summary_large_image");
  assert.equal(tags.get("og:image"), "https://gateway.example/a.png?x=1&y=2");
});
