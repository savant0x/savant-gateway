import assert from "node:assert/strict";
import test from "node:test";

import {
  contentDate,
  kindPillClass,
  formatCount,
  kindLabel,
  purchaseCta,
  relationLabel,
  shortExcerpt,
  tagPillClass,
  videoEmbedUrl,
} from "../lib/content/format.ts";

test("purchase CTA uses the existing route for every access state", () => {
  assert.deepEqual(purchaseCta("free", false), {
    label: "Open the console",
    href: "/dashboard",
  });
  assert.deepEqual(purchaseCta("paid", false), {
    label: "Create an account",
    href: "/signup",
  });
  assert.deepEqual(purchaseCta("paid", true), {
    label: "Add credit",
    href: "/account",
  });
  assert.deepEqual(purchaseCta("subscription", true), {
    label: "View plans",
    href: "/plans",
  });
});

test("dates are stable in UTC and malformed values do not throw", () => {
  assert.equal(contentDate("2026-11-01T23:30:00.000Z"), "Nov 1, 2026");
  assert.equal(contentDate("not-a-date"), "Undated");
  assert.equal(contentDate(null), "Undated");
});

test("counts are compact and an unreported zero stays zero", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(15400), "15.4K");
  assert.equal(formatCount(Number.NaN), "0");
});

test("video embeds validate the id and add autoplay only on request", () => {
  assert.equal(videoEmbedUrl(null), null);
  assert.equal(videoEmbedUrl("abc123"),
    "https://www.youtube-nocookie.com/embed/abc123?rel=0&modestbranding=1",
  );
  assert.equal(
    videoEmbedUrl("abc123", true),
    "https://www.youtube-nocookie.com/embed/abc123?rel=0&modestbranding=1&autoplay=1",
  );
  assert.equal(videoEmbedUrl("bad/id"), null);
  assert.equal(videoEmbedUrl("short"), null);
});

test("labels and excerpts stay presentation-only", () => {
  assert.equal(relationLabel("hands_on"), "Hands-on");
  assert.equal(kindLabel("repo"), "Repository");
  assert.equal(shortExcerpt("  a   b  ", 20), "a b");
  assert.equal(shortExcerpt("abcdefghij", 5), "abcd…");
});

test("Signal kind and topic pills use stable visual classes", () => {
  assert.match(kindPillClass("discussion"), /amber-300/);
  assert.equal(tagPillClass("ai-agents"), tagPillClass("ai-agents"));
  assert.match(tagPillClass("ai-agents"), /border-/);
});
