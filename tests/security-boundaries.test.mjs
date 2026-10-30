import assert from "node:assert/strict";
import test from "node:test";

import { isSameOriginRequest } from "../lib/admin-session.ts";
import { sanitizeError } from "../lib/http.ts";
import { readProviderError } from "../lib/providers/error-text.ts";
import { readProviderInput } from "../lib/providers/registry.ts";
import {
  configuredSecrets,
  redactSecrets,
  REDACTED,
} from "../lib/redaction.ts";

const CANARY = "canary-provider-key-0123456789";
const ENV = {
  PROVIDER_KEY: CANARY,
  ADMIN_PASSWORD: "admin-password-canary",
  STRIPE_WEBHOOK_SECRET: "whsec_canary_0123456789",
  PUBLIC_NAME: "not-a-secret-value",
  SHORT_KEY: "short",
};

async function withEnv(values, run) {
  const previous = new Map();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    // Await inside the guard: restoring before an async callback resumes would
    // run the assertion with a different environment than the one it set up.
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("configured secrets are name-scoped, long enough, and longest first", () => {
  const values = configuredSecrets(ENV);

  assert.ok(values.includes(CANARY));
  assert.ok(values.includes("admin-password-canary"));
  assert.equal(values.includes("not-a-secret-value"), false);
  assert.equal(values.includes("short"), false);

  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index - 1].length >= values[index].length);
  }
});

test("redaction removes configured values and token-shaped text", () => {
  const input = [
    `upstream rejected ${CANARY}`,
    "authorization: Bearer abcdefghijklmnop",
    "x-api-key: sk-live-0123456789abcdef",
    "webhook whsec_0123456789abcdef",
    "password=correct-horse-battery",
  ].join("\n");
  const output = redactSecrets(input, ENV);

  assert.equal(output.includes(CANARY), false);
  assert.equal(output.includes("abcdefghijklmnop"), false);
  assert.equal(output.includes("sk-live-0123456789abcdef"), false);
  assert.equal(output.includes("whsec_0123456789abcdef"), false);
  assert.equal(output.includes("correct-horse-battery"), false);
  assert.equal(output.includes("password="), true);
  assert.ok(output.includes(REDACTED));
});

test("redaction leaves ordinary diagnostics intact", () => {
  const output = redactSecrets(
    "Provider returned HTTP 502 after 20s; model mock-paid",
    ENV,
  );

  assert.equal(output, "Provider returned HTTP 502 after 20s; model mock-paid");
});

test("sanitizeError never logs a configured canary or returns it", async () => {
  const original = console.error;
  const logged = [];

  console.error = (...args) => logged.push(args.join(" "));

  try {
    await withEnv(ENV, () => {
      const message = sanitizeError(
        "test.boundary",
        new Error(`connect failed with ${CANARY}`),
        "Could not reach the provider",
      );

      assert.equal(message, "Could not reach the provider");
      assert.equal(logged.length, 1);
      assert.equal(logged[0].includes(CANARY), false);
      assert.ok(logged[0].includes(REDACTED));
    });
  } finally {
    console.error = original;
  }
});

test("a provider error body is redacted before any caller can store it", async () => {
  await withEnv(ENV, async () => {
    const nested = await readProviderError(
      new Response(
        JSON.stringify({
          error: { message: `Incorrect API key provided: ${CANARY}` },
        }),
        { status: 401 },
      ),
    );

    assert.equal(nested.includes(CANARY), false);
    assert.ok(nested.includes(REDACTED));

    const plain = await readProviderError(
      new Response(`upstream said Bearer ${CANARY}`, { status: 500 }),
    );

    assert.equal(plain.includes(CANARY), false);
  });
});

test("provider errors are bounded and fall back to the status", async () => {
  const long = await readProviderError(
    new Response("x".repeat(2_000), { status: 500 }),
  );

  assert.equal(long.length, 400);

  const empty = await readProviderError(new Response("", { status: 500 }));

  assert.equal(empty, "HTTP 500");
});

test("provider base URLs reject embedded credentials", () => {
  const valid = {
    slug: "commandcode",
    label: "CommandCode",
    kind: "both",
    baseUrl: "https://api.commandcode.ai/provider/v1",
    keyEnvVar: "COMMANDCODE_API_KEY",
    defaultHeaders: {},
    capabilities: { balance: false, subscription: false, pricing: false },
  };

  assert.equal(readProviderInput(valid).ok, true);
  assert.equal(
    readProviderInput({ ...valid, baseUrl: "http://127.0.0.1:8787/v1" }).ok,
    true,
  );

  for (const baseUrl of [
    "https://user:password@example.com/v1",
    "https://user@example.com/v1",
    "ftp://example.com/v1",
    "https://",
    "  ",
  ]) {
    const result = readProviderInput({ ...valid, baseUrl });

    assert.equal(result.ok, false, baseUrl);
  }
});

test("a spoofed forwarded host cannot make a foreign origin same-origin", () => {
  const request = (headers) =>
    new Request("http://localhost:3000/admin", { headers });

  const base = { host: "localhost:3000" };

  assert.equal(
    isSameOriginRequest(
      request({
        ...base,
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        forwarded: "host=evil.example;proto=https",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        ...base,
        origin: "http://localhost:3000",
        "x-forwarded-host": "evil.example",
      }),
    ),
    true,
  );
  assert.equal(isSameOriginRequest(request({ ...base })), true);
  assert.equal(
    isSameOriginRequest(request({ ...base, origin: "null" })),
    false,
  );
  assert.equal(
    isSameOriginRequest(request({ ...base, origin: "http://localhost:3000.evil" })),
    false,
  );
});
