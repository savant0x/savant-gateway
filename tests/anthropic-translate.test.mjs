import assert from "node:assert/strict";
import test from "node:test";

import {
  anthropicStream,
  toAnthropicRequest,
  toOpenAiCompletion,
} from "../lib/providers/anthropic-translate.ts";

function sse(events) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }

      controller.close();
    },
  });

  return new Response(anthropicStream(stream)).text();
}

test("OpenAI request bodies translate to Anthropic Messages", () => {
  const translated = toAnthropicRequest({
    model: "claude-sonnet-4-6",
    messages: [
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content: "Checking.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"x"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "found" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Look something up",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ],
    tool_choice: "required",
    max_tokens: 100,
  });

  assert.equal(translated.model, "claude-sonnet-4-6");
  assert.equal(translated.max_tokens, 100);
  assert.equal(translated.system, "Be brief.");
  assert.equal(translated.messages[0].role, "user");
  assert.equal(translated.messages[1].role, "assistant");
  assert.equal(translated.messages[1].content[1].type, "tool_use");
  assert.equal(translated.messages[2].content[0].type, "tool_result");
  assert.equal(translated.tools[0].name, "lookup");
  assert.deepEqual(translated.tool_choice, { type: "any" });
});

test("Anthropic responses translate to Chat Completions", () => {
  const translated = toOpenAiCompletion({
    id: "msg_1",
    model: "claude-sonnet-4-6",
    content: [
      { type: "text", text: "The answer." },
      { type: "tool_use", id: "toolu_1", name: "lookup", input: { q: "x" } },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 11, output_tokens: 4 },
  });

  assert.equal(translated.object, "chat.completion");
  assert.equal(translated.choices[0].message.content, "The answer.");
  assert.equal(translated.choices[0].message.tool_calls[0].id, "toolu_1");
  assert.equal(
    translated.choices[0].message.tool_calls[0].function.arguments,
    '{"q":"x"}',
  );
  assert.equal(translated.choices[0].finish_reason, "tool_calls");
  assert.deepEqual(translated.usage, {
    prompt_tokens: 11,
    completion_tokens: 4,
    total_tokens: 15,
  });
});

test("Anthropic streams become OpenAI chunks with usage and DONE", async () => {
  const text = await sse([
    {
      type: "message_start",
      message: {
        id: "msg_1",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 12 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hi" },
    },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 2 },
    },
    { type: "message_stop" },
  ]);

  assert.match(text, /"object":"chat.completion.chunk"/);
  assert.match(text, /"content":"Hi"/);
  assert.match(text, /"finish_reason":"stop"/);
  assert.match(text, /"prompt_tokens":12/);
  assert.match(text, /"completion_tokens":2/);
  assert.match(text, /data: \[DONE\]/);
  assert.equal(text.match(/data: \[DONE\]/g)?.length, 1);
});

test("a truncated stream still closes with a finish chunk and DONE", async () => {
  const text = await sse([
    {
      type: "message_start",
      message: { id: "msg_2", model: "claude", usage: { input_tokens: 1 } },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "partial" },
    },
  ]);

  assert.match(text, /"finish_reason":"stop"/);
  assert.match(text, /data: \[DONE\]/);
});

test("Anthropic stream errors become an OpenAI error event", async () => {
  const text = await sse([
    {
      type: "error",
      error: { type: "api_error", message: "upstream failed" },
    },
  ]);

  assert.match(text, /"error":\{/);
  assert.match(text, /upstream failed/);
  assert.match(text, /data: \[DONE\]/);
});
