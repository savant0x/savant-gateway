import assert from "node:assert/strict";
import test from "node:test";

import {
  createProbeClient,
  ProbeError,
} from "../lib/identity/probe-client.ts";

const PROVIDER = {
  slug: "savant",
  kind: "openai",
  baseUrl: "https://upstream.example",
  keyEnvVar: "PROVIDER_KEY",
};

const TARGET = { protocol: "chat", upstreamId: "gpt-test" };

const MESSAGES = [
  { role: "system", content: "You are a precise assistant." },
  { role: "user", content: "The capital of France is" },
];

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function sseResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function clientFor(fetch, overrides = {}) {
  return createProbeClient(
    {
      fetch,
      headers: () => ({ Authorization: "Bearer test" }),
      sleep: async () => {},
      now: () => 0,
      randomBytes: () => new Uint8Array(16),
      ...overrides,
    },
    { rpm: 10 },
  );
}

test("OpenAI non-stream maps content, usage and sends a guarded request", async () => {
  const calls = [];
  const client = clientFor(async (url, init) => {
    calls.push({ url, init });

    return jsonResponse({
      model: "gpt-test",
      choices: [{ message: { content: " Paris" } }],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    });
  });

  const result = await client.request({
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 1, top_p: 1, max_tokens: 1, n: 1 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.content, " Paris");
  assert.equal(result.modelField, "gpt-test");
  assert.equal(result.promptTokens, 5);
  assert.equal(result.completionTokens, 1);
  assert.equal(result.attempts, 1);

  assert.equal(calls[0].url, "https://upstream.example/chat/completions");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.cache, "no-store");

  const body = JSON.parse(calls[0].init.body);

  assert.equal(body.model, "gpt-test");
  assert.equal(body.temperature, 1);
  assert.equal(body.n, 1);
  assert.equal(body.stream, undefined);
  assert.equal(JSON.stringify(result).includes("Bearer test"), false);
});

test("Anthropic non-stream translates the request and normalizes the response", async () => {
  const calls = [];
  const client = clientFor(async (url, init) => {
    calls.push({ url, init });

    return jsonResponse({
      model: "claude-test",
      content: [{ type: "text", text: " Paris" }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });
  });

  const result = await client.request({
    provider: { ...PROVIDER, kind: "anthropic" },
    target: { protocol: "messages", upstreamId: "claude-test" },
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.content, " Paris");
  assert.equal(result.modelField, "claude-test");
  assert.equal(result.promptTokens, 5);
  assert.equal(result.completionTokens, 2);
  assert.equal(calls[0].url, "https://upstream.example/messages");

  const body = JSON.parse(calls[0].init.body);

  assert.equal(body.system, "You are a precise assistant.");
  assert.equal(body.messages[0].role, "user");
  assert.equal(body.messages[0].content[0].text, "The capital of France is");
  assert.equal(body.n, undefined);
});

test("a retryable 429 is retried and reports both attempts", async () => {
  let calls = 0;
  const slept = [];
  const client = clientFor(
    async () => {
      calls += 1;

      if (calls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }

      return jsonResponse({
        choices: [{ message: { content: "ok" } }],
      });
    },
    { sleep: async (ms) => slept.push(ms) },
  );

  const result = await client.request({
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("a 401 aborts immediately with an auth error", async () => {
  let calls = 0;
  const client = clientFor(async () => {
    calls += 1;

    return new Response("{}", { status: 401 });
  });

  await assert.rejects(
    () =>
      client.request({
        provider: PROVIDER,
        target: TARGET,
        messages: MESSAGES,
        sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
      }),
    (error) =>
      error instanceof ProbeError &&
      error.errorClass === "auth" &&
      error.status === 401 &&
      error.retryable === false,
  );

  assert.equal(calls, 1);
});

test("a non-retryable 400 is returned as a shape result", async () => {
  let calls = 0;
  const client = clientFor(async () => {
    calls += 1;

    return new Response("bad request", { status: 400 });
  });

  const result = await client.request({
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorClass, "http_4xx");
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("stream evidence counts the terminal and data after it", async () => {
  const good = [
    'data: {"model":"m","object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const goodClient = clientFor(async () => sseResponse(good));
  const goodResult = await goodClient.requestStream({
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  });

  assert.equal(goodResult.ok, true);
  assert.equal(goodResult.content, "hi");
  assert.equal(goodResult.stream?.terminalCount, 1);
  assert.equal(goodResult.stream?.afterTerminal, 0);

  const bad = `${good}data: {"choices":[]}\n\n`;
  const badClient = clientFor(async () => sseResponse(bad));
  const badResult = await badClient.requestStream({
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  });

  assert.equal(badResult.ok, false);
  assert.equal(badResult.errorClass, "stream_shape");
  assert.equal(badResult.stream?.terminalCount, 1);
  assert.equal(badResult.stream?.afterTerminal, 1);
});

test("the limiter spaces two requests at the configured rpm", async () => {
  let now = 0;
  const slept = [];
  const client = clientFor(
    async () =>
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
      }),
    {
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    },
  );

  const input = {
    provider: PROVIDER,
    target: TARGET,
    messages: MESSAGES,
    sampling: { temperature: 0, top_p: 1, max_tokens: 8 },
  };

  await client.request(input);
  await client.request(input);

  assert.deepEqual(slept, [6_000]);
});
