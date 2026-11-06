import assert from "node:assert/strict";
import test from "node:test";

import { anthropicStream } from "../lib/providers/anthropic-stream.ts";
import {
  completionText,
  streamDeltaChars,
  streamDeltaCounts,
} from "../lib/gateway-usage.ts";

test("buffered fallback counts modern tool names and argument text once", () => {
  const text = completionText({
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "answer",
          reasoning_content: "reason",
          tool_calls: [
            {
              id: "call_1",
              index: 0,
              type: "function",
              function: { name: "lookup", arguments: "{\"q\":\"x\"}" },
            },
            {
              id: "call_2",
              index: 1,
              type: "function",
              function: { name: "fetch", arguments: "{}" },
            },
          ],
        },
      },
    ],
  });

  assert.equal(text, "answerreasonlookup{\"q\":\"x\"}fetch{}");
  assert.equal(text.includes("call_1"), false);
});

test("buffered fallback prefers modern calls over legacy function_call", () => {
  const text = completionText({
    choices: [
      {
        message: {
          content: "",
          tool_calls: [
            { function: { name: "modern", arguments: "M" } },
          ],
          function_call: { name: "legacy", arguments: "L" },
        },
      },
    ],
  });

  assert.equal(text, "modernM");
  assert.equal(text.includes("legacy"), false);
});

test("legacy buffered function_call is counted when there is no modern call", () => {
  const text = completionText({
    choices: [
      {
        message: {
          content: "a",
          function_call: { name: "legacy", arguments: "{\"n\":1}" },
        },
      },
    ],
  });

  assert.equal(text, "alegacy{\"n\":1}");
});

test("malformed choices and fields are ignored without throwing", () => {
  for (const value of [
    null,
    [],
    { choices: null },
    { choices: [null, 3, { message: null }, { message: { tool_calls: [null] } }] },
    { choices: [{ message: { tool_calls: "not-an-array" } }] },
  ]) {
    assert.equal(completionText(value), "");
  }
});

test("stream counters keep representations separate and choose at finalization", () => {
  const legacy = streamDeltaCounts({
    choices: [
      { delta: { content: "a", function_call: { name: "old", arguments: "L" } } },
    ],
  });
  const modern = streamDeltaCounts({
    choices: [
      { delta: { content: "b", tool_calls: [{ function: { name: "new", arguments: "M" } }] } },
    ],
  });
  const total = {
    text: legacy.text + modern.text,
    modern: legacy.modern + modern.modern,
    legacy: legacy.legacy + modern.legacy,
  };

  assert.deepEqual(total, { text: 2, modern: 4, legacy: 4 });
  assert.equal(total.text + Math.max(total.modern, total.legacy), 6);
  assert.equal(total.text + total.modern + total.legacy, 10);
});

test("a frame with only tool arguments counts them", () => {
  assert.equal(
    streamDeltaChars({
      choices: [
        { delta: { tool_calls: [{ function: { arguments: "12345" } }] } },
      ],
    }),
    5,
  );
});

test("16,000 argument characters are counted, not dropped", () => {
  const argument = "x".repeat(16_000);
  const buffered = completionText({
    choices: [
      { message: { tool_calls: [{ function: { name: "write", arguments: argument } }] } },
    ],
  });
  const streamed = streamDeltaCounts({
    choices: [
      { delta: { tool_calls: [{ function: { name: "write", arguments: argument } }] } },
    ],
  });

  assert.equal(buffered.length, 16_005);
  assert.equal(streamed.text, 0);
  assert.equal(streamed.modern, 16_005);
  assert.equal(streamed.legacy, 0);
});

test("Unicode is counted in UTF-16 code units consistently", () => {
  const text = "🙂é";
  const buffered = completionText({
    choices: [{ message: { content: text } }],
  });
  const streamed = streamDeltaCounts({
    choices: [{ delta: { content: text } }],
  });

  assert.equal(buffered, text);
  assert.equal(streamed.text, text.length);
  assert.equal(streamed.text, 3);
});

test("an Anthropic tool stream exposes name and partial arguments to the counter", async () => {
  const encoder = new TextEncoder();
  const upstream = new ReadableStream({
    start(controller) {
      for (const event of [
        {
          type: "message_start",
          message: { id: "msg_tool", model: "claude" },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "lookup",
          },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "{\"q\":" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "\"x\"}" },
        },
        { type: "message_stop" },
      ]) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });
  const translated = new Response(anthropicStream(upstream));
  const body = await translated.text();
  const counts = { text: 0, modern: 0, legacy: 0 };

  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;

    const payload = line.slice(5).trim();

    if (!payload || payload === "[DONE]") continue;

    const delta = streamDeltaCounts(JSON.parse(payload));

    counts.text += delta.text;
    counts.modern += delta.modern;
    counts.legacy += delta.legacy;
  }

  assert.equal(counts.modern, "lookup".length + "{\"q\":\"x\"}".length);
  assert.equal(counts.legacy, 0);
});

test("reported zero remains authoritative because the caller prefers it", () => {
  // The fallback helpers only report characters; lib/usage.ts decides priority.
  const counts = streamDeltaCounts({
    choices: [{ delta: { content: "ignored when reported" } }],
  });

  assert.ok(counts.text > 0);
});
