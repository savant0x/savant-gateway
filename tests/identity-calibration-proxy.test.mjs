import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  applyArmTransform,
  armById,
  armCoverage,
  assertArmCoverage,
  buildArmSet,
  CONTEXT_KEEP_CHARS,
  HIDDEN_PROMPT,
  PHANTOM_TOOL,
} from "../lib/identity/calibration/arms.ts";
import {
  admitProxyRequest,
  isLoopbackHost,
  sanitizeForwardHeaders,
  upstreamUrl,
} from "../lib/identity/calibration/proxy.ts";
import { createCalibrationProxy } from "../scripts/identity-calibration-proxy.mjs";
import { CALIBRATION_MANIFEST } from "../lib/identity/calibration/manifest.ts";

const ARMS = buildArmSet({
  substitutionModelId: "vendor/other-model",
  versionSwapModelId: "vendor/older-checkpoint",
});

const REQUEST = () => ({
  model: "vendor/target-model",
  messages: [
    { role: "system", content: "Answer briefly." },
    {
      role: "user",
      content: `${"filler ".repeat(80)}the needle is SAVANT-ALPHA-7391`,
    },
  ],
  tools: [
    {
      type: "function",
      function: { name: "create_user", description: "Create a user." },
    },
  ],
});

test("the arm set covers the manifest classes exactly once", () => {
  const required = CALIBRATION_MANIFEST.arms.classes.map((entry) => entry.id);

  assertArmCoverage(ARMS, required);
  assert.equal(ARMS.length, 6);
  assert.deepEqual(
    new Set(ARMS.map((entry) => entry.cohort)),
    new Set(["control", "positive"]),
  );
  assert.equal(armCoverage(ARMS).length, 6);
});

test("a duplicate or missing arm is refused", () => {
  assert.throws(() => assertArmCoverage(ARMS, ["substitution"]), /expected/);
  assert.throws(
    () => assertArmCoverage([...ARMS, ARMS[0]], CALIBRATION_MANIFEST.arms.classes.map((c) => c.id)),
    /duplicate/,
  );
});

test("the control arm changes nothing and reports equal hashes", () => {
  const control = armById(ARMS, "control");

  assert.ok(control);

  const result = applyArmTransform(control, REQUEST());

  assert.equal(result.receipt.changed, false);
  assert.equal(result.receipt.inputSha256, result.receipt.outputSha256);
  assert.deepEqual(result.request, REQUEST());
});

test("the hidden-prompt arm inserts one system message and refuses a second", () => {
  const hidden = armById(ARMS, "hidden_prompt");

  assert.ok(hidden);

  const result = applyArmTransform(hidden, REQUEST());

  assert.equal(result.request.messages[0].role, "system");
  assert.equal(result.request.messages[0].content, HIDDEN_PROMPT);
  assert.equal(
    result.request.messages.filter((message) => message.content === HIDDEN_PROMPT)
      .length,
    1,
  );
  assert.throws(
    () => applyArmTransform(hidden, result.request),
    /already present/,
  );
});

test("the truncation arm cuts the first non-system message to the budget", () => {
  const truncation = armById(ARMS, "context_truncation");

  assert.ok(truncation);

  const result = applyArmTransform(truncation, REQUEST());
  const content = result.request.messages[1].content;

  assert.equal(typeof content, "string");
  assert.equal(content.length, CONTEXT_KEEP_CHARS);
  assert.ok(!content.includes("SAVANT-ALPHA-7391"));
  assert.equal(result.request.messages[0].content, "Answer briefly.");
});

test("the phantom-tool arm renames only the first tool", () => {
  const phantom = armById(ARMS, "phantom_tool");

  assert.ok(phantom);

  const request = REQUEST();

  request.tools.push({
    type: "function",
    function: { name: "second_tool" },
  });

  const result = applyArmTransform(phantom, request);

  assert.equal(result.request.tools[0].function?.name, PHANTOM_TOOL);
  assert.equal(result.request.tools[1].function?.name, "second_tool");
});

test("a routing arm replaces the model and refuses a repeat", () => {
  const substitution = armById(ARMS, "substitution");

  assert.ok(substitution);

  const result = applyArmTransform(substitution, REQUEST());

  assert.equal(result.request.model, "vendor/other-model");
  assert.throws(
    () => applyArmTransform(substitution, result.request),
    /already routes/,
  );
});

test("the loopback host check accepts only loopback names", () => {
  for (const host of ["127.0.0.1:4010", "localhost:80", "[::1]:9", "127.0.0.1"]) {
    assert.equal(isLoopbackHost(host), true, host);
  }

  for (const host of ["example.test", "0.0.0.0:4010", "10.0.0.1", "[2001:db8::1]"]) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test("forwarding drops the credential and the caller Host", () => {
  const headers = sanitizeForwardHeaders({
    host: "127.0.0.1:4010",
    authorization: "Bearer secret",
    "x-api-key": "secret",
    cookie: "session=1",
    "content-type": "application/json",
    "accept-encoding": "gzip",
  });

  assert.equal(headers.authorization, undefined);
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.host, undefined);
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["accept-encoding"], "gzip");
});

test("admission refuses a non-loopback Host, a bad path and a bad method", () => {
  assert.equal(
    admitProxyRequest({
      host: "example.test",
      url: "/v1/chat/completions",
      method: "POST",
    }).ok,
    false,
  );
  assert.equal(
    admitProxyRequest({
      host: "127.0.0.1:1",
      url: "v1/chat",
      method: "POST",
    }).ok,
    false,
  );
  assert.equal(
    admitProxyRequest({
      host: "127.0.0.1:1",
      url: "/v1/chat",
      method: "DELETE",
    }).ok,
    false,
  );
  assert.ok(
    admitProxyRequest({
      host: "127.0.0.1:1",
      url: "/v1/chat",
      method: "POST",
    }).ok,
  );
});

test("upstreamUrl joins without doubling the slash", () => {
  assert.equal(
    upstreamUrl("https://api.test/v1/", "/chat/completions"),
    "https://api.test/v1/chat/completions",
  );
});

test("the proxy forwards the transformed body and records one receipt", async () => {
  const seen = [];
  const upstream = http.createServer((request, response) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        authorization: request.headers.authorization,
        host: request.headers.host,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = upstream.address().port;

  const { server, receipts } = createCalibrationProxy({
    arm: "phantom_tool",
    upstream: `http://127.0.0.1:${upstreamPort}/v1`,
    credential: "test-credential",
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const proxyPort = server.address().port;

  const response = await fetch(`http://127.0.0.1:${proxyPort}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(REQUEST()),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].body.tools[0].function.name, PHANTOM_TOOL);
  assert.equal(seen[0].body.model, "vendor/target-model");
  assert.equal(seen[0].authorization, "Bearer test-credential");
  assert.equal(seen[0].host, `127.0.0.1:${upstreamPort}`);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].armId, "phantom_tool");
  assert.equal(receipts[0].transform, "rewrite_tool");

  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
});

test("the proxy refuses a forged non-loopback Host before forwarding", async () => {
  const { server, receipts } = createCalibrationProxy({
    arm: "control",
    upstream: "http://127.0.0.1:1/v1",
    credential: "test-credential",
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/chat/completions",
        method: "POST",
        headers: { host: "example.test", "content-type": "application/json" },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );

    request.on("error", reject);
    request.end(JSON.stringify(REQUEST()));
  });

  assert.equal(status, 403);
  assert.equal(receipts.length, 0);

  await new Promise((resolve) => server.close(resolve));
});
