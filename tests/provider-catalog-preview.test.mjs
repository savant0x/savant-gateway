import assert from "node:assert/strict";
import test from "node:test";

import { authHeaders } from "../lib/providers/auth-headers.ts";
import { buildSyncedCatalog } from "../lib/providers/catalog.ts";
import { previewProviderCatalog } from "../lib/providers/preview.ts";

/**
 * A preview is a read. These cases prove the two things that make it safe to
 * offer before a key exists: the transport can omit the credential without
 * dropping the provider's own headers, and the counts come from the importer
 * rather than a second estimator.
 */

const KEY_VAR = "PREVIEW_TEST_KEY";

const PROVIDER = {
  slug: "preview",
  label: "Preview",
  kind: "openai",
  baseUrl: "https://preview.example.test/v1",
  keyEnvVar: KEY_VAR,
  defaultHeaders: { "X-Preview-Header": "1" },
  requiresModelReview: false,
  enabled: false,
  sortOrder: 0,
  capabilities: { balance: false, subscription: false, pricing: true },
};

const ENTRIES = [
  { id: "cc/paid-a", pricing: { min_ask_in: 1.5, min_ask_out: 3 } },
  { id: "cc/paid-b", pricing: { min_ask_in: 0.25, min_ask_out: 1 } },
  { id: "free/allowance", weight: 1, pricing: {} },
  { id: "cc/alias-one", owned_by: "alias" },
  { id: "cc/video-one", output_modalities: ["video"] },
];

function withKey(key) {
  const previous = process.env[KEY_VAR];

  if (key === undefined) delete process.env[KEY_VAR];
  else process.env[KEY_VAR] = key;

  return () => {
    if (previous === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = previous;
  };
}

test("a keyless read keeps the provider's headers and drops both credential headers", () => {
  const headers = authHeaders("openai", null, { "X-Preview-Header": "1" });

  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers["X-Preview-Header"], "1");
  assert.equal(headers.Accept, "application/json");
});

test("an anthropic read still sends the wire version without a key", () => {
  const headers = authHeaders("anthropic", null);

  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers["anthropic-version"], "2023-06-01");
});

test("a configured key still produces the credential headers", () => {
  const both = authHeaders("both", "secret-value");

  assert.equal(both.Authorization, "Bearer secret-value");
  assert.equal(both["x-api-key"], "secret-value");
});

test("the preview counts what the importer would count, and says it read keyless", async () => {
  const restore = withKey(undefined);

  try {
    const preview = await previewProviderCatalog(PROVIDER, {
      request: async () => new Response("{}"),
      readCatalog: async () => ENTRIES,
    });
    const imported = buildSyncedCatalog(PROVIDER, ENTRIES, new Map());

    assert.equal(preview.keyless, true);
    assert.equal(preview.upstreamRows, ENTRIES.length);
    assert.equal(preview.imported, imported.rows.length);
    assert.deepEqual(preview.refused, {
      alias: imported.skippedAliases.length,
      media: imported.skippedMedia.length,
      freePool: 0,
    });
    assert.equal(
      preview.free,
      imported.rows.filter((row) => row.allowFree).length,
    );
    assert.equal(
      preview.sample.length,
      Math.min(imported.rows.length, 12),
      "the sample is bounded",
    );
    assert.ok(preview.sample.every((row) => row.costInputMicros >= 0));
  } finally {
    restore();
  }
});

test("a configured key makes the same read report itself as keyed", async () => {
  const restore = withKey("test-key");

  try {
    const preview = await previewProviderCatalog(PROVIDER, {
      request: async () => new Response("{}"),
      readCatalog: async () => ENTRIES,
    });

    assert.equal(preview.keyless, false);
  } finally {
    restore();
  }
});

test("a provider that forbids free-pool resale shows the refusal it would get", async () => {
  const restore = withKey(undefined);

  try {
    const restricted = { ...PROVIDER, resaleFreePool: false };
    const preview = await previewProviderCatalog(restricted, {
      request: async () => new Response("{}"),
      readCatalog: async () => ENTRIES,
    });
    const imported = buildSyncedCatalog(restricted, ENTRIES, new Map());

    assert.equal(preview.refused.freePool, imported.skippedFreePool.length);
    assert.ok(preview.refused.freePool > 0, "the free row is refused");
    assert.equal(preview.free, 0);
  } finally {
    restore();
  }
});

test("a refusing catalog throws the provider's own text instead of a zero", async () => {
  const restore = withKey(undefined);

  try {
    await assert.rejects(
      () =>
        previewProviderCatalog(PROVIDER, {
          request: async () =>
            Response.json({ error: { message: "authentication required" } }, {
              status: 401,
            }),
        }),
      /authentication required|401/i,
    );
  } finally {
    restore();
  }
});

test("the shipped reader follows pagination with the injected transport", async () => {
  const restore = withKey(undefined);
  const paths = [];

  try {
    const preview = await previewProviderCatalog(PROVIDER, {
      request: async (_provider, path) => {
        paths.push(path);

        return path.includes("after_id")
          ? Response.json({ data: [{ id: "cc/second" }], has_more: false })
          : Response.json({
              data: [{ id: "cc/first" }],
              has_more: true,
              last_id: "cc/first",
            });
      },
    });

    assert.equal(preview.upstreamRows, 2);
    assert.equal(paths.length, 2);
    assert.match(paths[1], /after_id=cc%2Ffirst/);
  } finally {
    restore();
  }
});
