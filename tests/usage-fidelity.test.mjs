import assert from "node:assert/strict";
import test from "node:test";

import { toOpenAiCompletion } from "../lib/providers/anthropic-response.ts";
import { anthropicStream } from "../lib/providers/anthropic-stream.ts";
import {
  estimatedUsage,
  mergeProviderUsage,
  readProviderUsage,
  resolveUsage,
  usageSource,
} from "../lib/usage.ts";

test("complete usage keeps totals and provider subsets apart", () => {
  const usage = readProviderUsage({
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 20 },
    },
  });

  assert.deepEqual(usage, {
    inputTokens: 100,
    outputTokens: 50,
    cachedInputTokens: 40,
    cacheWriteInputTokens: null,
    reasoningOutputTokens: 20,
  });

  const resolved = resolveUsage({
    usage,
    fallbackInputTokens: 999,
    fallbackOutputTokens: 999,
  });

  assert.equal(resolved.inputTokens, 100);
  assert.equal(resolved.outputTokens, 50);
  assert.equal(resolved.complete, true);
  assert.equal(resolved.partial, false);
  assert.equal(usageSource(resolved), "reported");
});

test("a missing side is estimated, never an authoritative zero", () => {
  const usage = readProviderUsage({ usage: { prompt_tokens: 12 } });

  assert.equal(usage?.outputTokens, null);

  const resolved = resolveUsage({
    usage,
    fallbackInputTokens: 500,
    fallbackOutputTokens: 9,
  });

  assert.equal(resolved.inputTokens, 12);
  assert.equal(resolved.outputTokens, 9);
  assert.equal(resolved.complete, false);
  assert.equal(resolved.partial, true);
  assert.equal(usageSource(resolved), "partial");
});

test("absent and malformed counts stay absent", () => {
  for (const value of [
    {},
    { usage: {} },
    { usage: { prompt_tokens: -1, completion_tokens: -2 } },
    { usage: { prompt_tokens: "abc", completion_tokens: true } },
    { usage: { prompt_tokens: null, completion_tokens: null } },
  ]) {
    assert.equal(readProviderUsage(value), null, JSON.stringify(value));
  }

  const coerced = readProviderUsage({
    usage: { prompt_tokens: true, completion_tokens: "2" },
  });

  assert.equal(coerced?.inputTokens, null);
  assert.equal(coerced?.outputTokens, 2);

  const resolved = resolveUsage({
    usage: coerced,
    fallbackInputTokens: 30,
    fallbackOutputTokens: 0,
  });

  assert.equal(resolved.inputTokens, 30);
  assert.equal(resolved.partial, true);
});

test("a subset larger than its total is not stored", () => {
  const usage = readProviderUsage({
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 500 },
      completion_tokens_details: { reasoning_tokens: 60 },
    },
  });

  assert.equal(usage?.cachedInputTokens, null);
  assert.equal(usage?.reasoningOutputTokens, null);
  assert.equal(usage?.inputTokens, 100);
  assert.equal(usage?.outputTokens, 50);
});

test("split usage frames merge per component", () => {
  const merged = mergeProviderUsage(
    readProviderUsage({ usage: { prompt_tokens: 12 } }),
    readProviderUsage({ usage: { completion_tokens: 2 } }),
  );

  assert.equal(merged?.inputTokens, 12);
  assert.equal(merged?.outputTokens, 2);

  const later = mergeProviderUsage(merged, readProviderUsage({ usage: {} }));

  assert.equal(later?.inputTokens, 12);
  assert.equal(later?.outputTokens, 2);
});

test("a wholly estimated record is labelled and uses both fallbacks", () => {
  const resolved = estimatedUsage(40, 7);

  assert.equal(resolved.inputTokens, 40);
  assert.equal(resolved.outputTokens, 7);
  assert.equal(resolved.reported, false);
  assert.equal(usageSource(resolved), "estimated");
});

test("Anthropic normalization counts cache tokens once and invents nothing", () => {
  const translated = toOpenAiCompletion({
    id: "msg_1",
    model: "claude",
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 2,
      output_tokens: 3,
    },
  });

  const usage = readProviderUsage(translated);

  assert.equal(usage?.inputTokens, 17);
  assert.equal(usage?.outputTokens, 3);
  assert.equal(usage?.cachedInputTokens, 5);
  assert.equal(usage?.cacheWriteInputTokens, 2);

  const partial = toOpenAiCompletion({
    id: "msg_2",
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: 10 },
  });

  assert.equal(partial.usage?.prompt_tokens, 10);
  assert.equal("completion_tokens" in (partial.usage ?? {}), false);
  assert.equal("total_tokens" in (partial.usage ?? {}), false);
});

async function collect(stream) {
  const response = new Response(anthropicStream(stream));
  return response.text();
}

function events(list) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const event of list) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

test("Anthropic stream reports only the components it received", async () => {
  const text = await collect(
    events([
      {
        type: "message_start",
        message: {
          id: "msg_3",
          model: "claude",
          usage: { input_tokens: 12, cache_read_input_tokens: 4 },
        },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hi" },
      },
      { type: "message_delta", usage: { output_tokens: 2 } },
      { type: "message_stop" },
    ]),
  );
  const usageLine = text
    .split("\n")
    .find((line) => line.includes('"usage"') && line.includes("prompt_tokens"));

  assert.ok(usageLine);

  const payload = JSON.parse(usageLine.slice(5));

  assert.equal(payload.usage.prompt_tokens, 16);
  assert.equal(payload.usage.completion_tokens, 2);
  assert.equal(payload.usage.prompt_tokens_details.cached_tokens, 4);
  assert.equal(payload.usage.total_tokens, 18);

  const quiet = await collect(
    events([
      { type: "message_start", message: { id: "msg_4", usage: {} } },
      { type: "message_stop" },
    ]),
  );
  const quietUsage = quiet
    .split("\n")
    .filter((line) => line.includes('"usage"'))
    .map((line) => JSON.parse(line.slice(5)).usage);

  assert.ok(quietUsage.every((usage) => !("prompt_tokens" in usage)));
});
