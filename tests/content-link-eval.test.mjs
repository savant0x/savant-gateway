import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { suggestModelLinks } from "../lib/content/linking.ts";
import { canonicalModelKey } from "../lib/model-identity.ts";

/**
 * Labelled evaluation for the content-to-model matcher (FID-2026-1123-001).
 *
 * The matcher is a product claim: a reader is told these models are "in this
 * piece". So the corpus asserts exact sets, never "at least one". Models are
 * identified by their provider-neutral key, which is what makes the expected set
 * stable when the same weights are sold under several provider prefixes.
 *
 * Extend `tests/fixtures/content-link-eval.json` when a new failure is found in
 * the wild; the corpus is the regression test, not a snapshot to be edited until
 * it passes.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/content-link-eval.json", import.meta.url), "utf8"),
);

const models = fixture.models;
const keyOf = new Map(models.map((model) => [model.id, canonicalModelKey(model.upstreamId)]));

function link(input) {
  return suggestModelLinks(
    {
      title: input.title,
      tags: input.tags ?? [],
      kind: input.kind ?? "article",
      description: input.description,
      excerpt: input.excerpt,
    },
    models,
  );
}

function keysOf(input) {
  const keys = link(input).map((suggestion) => keyOf.get(suggestion.modelId));

  return Array.from(new Set(keys)).sort();
}

test("the labelled corpus links exactly the expected models", () => {
  const failures = [];
  let expected = 0;
  let correct = 0;
  let spurious = 0;

  for (const entry of fixture.cases) {
    const got = keysOf(entry);
    const want = [...entry.expect].sort();
    const banned = entry.reject ?? [];
    expected += want.length;

    const missing = want.filter((key) => !got.includes(key));
    const extra = got.filter((key) => !want.includes(key));
    const rejected = got.filter((key) => banned.includes(key));

    correct += want.filter((key) => got.includes(key)).length;
    spurious += extra.length;

    if (missing.length || extra.length || rejected.length) {
      failures.push(
        `${entry.id}\n  title: ${entry.title}\n  want: ${want.join(", ") || "(none)"}` +
          `\n  got:  ${got.join(", ") || "(none)"}` +
          (missing.length ? `\n  missing: ${missing.join(", ")}` : "") +
          (extra.length ? `\n  extra: ${extra.join(", ")}` : "") +
          (rejected.length ? `\n  rejected: ${rejected.join(", ")}` : ""),
      );
    }
  }

  const recall = expected === 0 ? 1 : correct / expected;
  const precision = correct + spurious === 0 ? 1 : correct / (correct + spurious);

  assert.equal(
    failures.length,
    0,
    `${failures.length} of ${fixture.cases.length} labelled cases failed ` +
      `(recall ${recall.toFixed(2)}, precision ${precision.toFixed(2)})\n\n${failures.join("\n\n")}`,
  );
});

test("each suggestion names its evidence and a relation", () => {
  for (const entry of fixture.cases) {
    for (const suggestion of link(entry)) {
      assert.ok(
        ["Title matches", "Tag matches", "Excerpt matches", "Description matches"].some(
          (prefix) => suggestion.reason.startsWith(prefix),
        ),
        `${entry.id} produced an unnamed reason: ${suggestion.reason}`,
      );
      assert.ok(suggestion.confidence > 0 && suggestion.confidence <= 1);
      assert.ok(suggestion.relation.length > 0);
    }
  }
});
