import assert from "node:assert/strict";
import test from "node:test";

import { buildSyncedModels } from "../lib/providers/catalog.ts";

const SAVANT = {
  slug: "savant",
  label: "Savant",
  kind: "openai",
  baseUrl: "https://api.apinex.bond/v1",
  keyEnvVar: "PROVIDER_KEY",
  defaultHeaders: { src: "gate" },
  capabilities: { balance: true, subscription: true, pricing: true },
  enabled: true,
  sortOrder: 10,
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

const COMMANDCODE = {
  ...SAVANT,
  slug: "commandcode",
  label: "CommandCode",
  kind: "both",
  baseUrl: "https://api.commandcode.ai/provider/v1",
  keyEnvVar: "COMMANDCODE_API_KEY",
  defaultHeaders: {},
  capabilities: { balance: false, subscription: false, pricing: false },
  sortOrder: 20,
};

test("a non-default provider publishes namespaced ids only for its own models", () => {
  const rows = buildSyncedModels(
    COMMANDCODE,
    [{ id: "gpt-6-luna" }],
    new Map(),
  );
  const savantRows = buildSyncedModels(
    SAVANT,
    [{ id: "free/gpt-6-luna", weight: 2 }],
    new Map(),
  );

  assert.equal(rows[0].id, "commandcode/gpt-6-luna");
  assert.equal(rows[0].upstreamId, "gpt-6-luna");
  assert.equal(rows[0].upstreamSlug, "commandcode");
  assert.equal(savantRows[0].id, "free/gpt-6-luna");
  assert.equal(savantRows[0].upstreamSlug, "savant");
  assert.equal(rows.length, 1);
});

test("a mixed-protocol provider routes Claude to Messages and excludes unsupported endpoints", () => {
  const rows = buildSyncedModels(
    COMMANDCODE,
    [
      {
        id: "claude-sonnet-4-6",
        supported_endpoints: [
          "https://api.commandcode.ai/provider/v1/messages",
        ],
      },
      {
        id: "deepseek/deepseek-v4-flash",
        supported_endpoints: [
          "https://api.commandcode.ai/provider/v1/chat/completions",
        ],
      },
      {
        id: "responses-only",
        supported_endpoints: [
          "https://api.commandcode.ai/provider/v1/responses",
        ],
      },
    ],
    new Map(),
  );
  const byId = new Map(rows.map((row) => [row.upstreamId, row]));

  assert.equal(rows.length, 2);
  assert.equal(byId.get("claude-sonnet-4-6").protocol, "messages");
  assert.equal(byId.get("claude-sonnet-4-6").family, "Claude");
  assert.equal(byId.get("deepseek/deepseek-v4-flash").protocol, "chat");
  assert.equal(byId.has("responses-only"), false);
});

test("free-pool rows keep their weight and zero cost while unpaid rows stay unknown", () => {
  const rows = buildSyncedModels(
    COMMANDCODE,
    [{ id: "free/gpt-6-luna", weight: 3 }, { id: "claude-sonnet-4-6" }],
    new Map(),
  );
  const free = rows.find((row) => row.upstreamId === "free/gpt-6-luna");
  const unknown = rows.find((row) => row.upstreamId === "claude-sonnet-4-6");

  assert.equal(free.id, "commandcode/free/gpt-6-luna");
  assert.equal(free.allowFree, true);
  assert.equal(free.tokenWeight, 3);
  assert.equal(free.costInputMicros, 0);
  assert.equal(free.costOutputMicros, 0);
  assert.equal(unknown.costSource, "unknown");
  assert.equal(unknown.allowFree, false);
});

test("a priced row carries synced cost and derives family from metadata", () => {
  const rows = buildSyncedModels(
    SAVANT,
    [{ id: "deepseek/deepseek-v4-flash" }],
    new Map([
      [
        "deepseek/deepseek-v4-flash",
        {
          provider: "DeepSeek",
          dollarsPer1M: 0.5,
          outputDollarsPer1M: 2,
        },
      ],
    ]),
  );

  assert.equal(rows[0].family, "DeepSeek");
  assert.equal(rows[0].costSource, "synced");
  assert.equal(rows[0].costInputMicros, 500_000);
  assert.equal(rows[0].costOutputMicros, 2_000_000);
  assert.equal(rows[0].sortOrder, 10);
});

test("a group sentinel never becomes the family", () => {
  const rows = buildSyncedModels(
    SAVANT,
    [{ id: "free/gpt-6-luna", provider: "Free", weight: 1 }],
    new Map(),
  );

  assert.equal(rows[0].family, "GPT");
});

test("subscription-only weights survive without granting free access", () => {
  const [row] = buildSyncedModels(
    SAVANT,
    [{ id: "free/claude-opus", allowFree: false, weight: 8 }],
    new Map(),
  );

  assert.equal(row.tokenWeight, 8);
  assert.equal(row.allowFree, false);
  assert.equal(row.costSource, "unknown");
});

test("context aliases and partial public metadata preserve authenticated fields", () => {
  const [row] = buildSyncedModels(
    SAVANT,
    [
      {
        id: "gpt-example",
        context_window: 128000,
        weight: 3,
        supportsTools: true,
        supportsVision: true,
        health: "healthy",
        dollarsPer1M: 0.4,
        outputDollarsPer1M: 0.6,
      },
    ],
    new Map([["gpt-example", { name: "Example", contextWindow: " 1M " }]]),
  );

  assert.equal(row.contextWindow, "1M");
  assert.equal(row.tokenWeight, 3);
  assert.equal(row.supportsTools, true);
  assert.equal(row.supportsVision, true);
  assert.equal(row.health, "healthy");
  assert.equal(row.costInputMicros, 400000);
  assert.equal(row.costOutputMicros, 600000);
});

test("blank or malformed context metadata falls back to authenticated context", () => {
  for (const context of ["", "   ", null, false, {}]) {
    const [row] = buildSyncedModels(
      SAVANT,
      [{ id: "gpt-example", context_window: 128000 }],
      new Map([["gpt-example", { contextWindow: context }]]),
    );

    assert.equal(row.contextWindow, "128000");
  }
});

test("absent and malformed prices never claim a known zero cost", () => {
  for (const price of [
    undefined,
    null,
    "",
    "  ",
    false,
    true,
    -1,
    "-2",
    Infinity,
    NaN,
  ]) {
    const [row] = buildSyncedModels(
      SAVANT,
      [{ id: "gpt-example", dollarsPer1M: price }],
      new Map(),
    );

    assert.equal(row.costSource, "unknown", String(price));
  }
});

test("explicit zero and numeric price strings remain valid costs", () => {
  for (const price of [0, "0", "0.25"]) {
    const [row] = buildSyncedModels(
      SAVANT,
      [{ id: "gpt-example", dollarsPer1M: price }],
      new Map(),
    );

    assert.equal(row.costSource, "synced");
    assert.equal(row.costInputMicros, Number(price) * 1000000);
    assert.equal(row.costOutputMicros, row.costInputMicros);
  }
});

test("an explicitly invalid output price makes the model unpriced", () => {
  const [row] = buildSyncedModels(
    SAVANT,
    [{ id: "gpt-example", dollarsPer1M: 1, outputDollarsPer1M: -2 }],
    new Map(),
  );

  assert.equal(row.costSource, "unknown");
});

test("a published zero output rate falls back to the input rate", () => {
  const [row] = buildSyncedModels(
    SAVANT,
    [{ id: "drex-like", dollarsPer1M: 0.04, outputDollarsPer1M: 0 }],
    new Map(),
  );

  assert.equal(row.costInputMicros, 40000);
  assert.equal(row.costOutputMicros, 40000);
  assert.equal(row.costSource, "synced");
});

test("a zero output rate with no input rate stays unknown rather than free", () => {
  const [row] = buildSyncedModels(
    SAVANT,
    [{ id: "unpriced", outputDollarsPer1M: 0 }],
    new Map(),
  );

  assert.equal(row.costSource, "unknown");
});
