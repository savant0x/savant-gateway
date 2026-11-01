import assert from "node:assert/strict";
import test from "node:test";

import {
  DETERMINISTIC_CANARIES,
  FINGERPRINT_CELLS,
} from "../lib/identity/battery.ts";
import { ProbeError } from "../lib/identity/probe-client.ts";
import { executeRun } from "../lib/identity/runner.ts";
import {
  countSamples,
  ensureProtocol,
  getRun,
  getVerdict,
  insertReference,
  insertRun,
  requestCancel,
} from "../lib/identity/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const T0 = "2026-11-01T12:00:00.000Z";
const T1 = "2026-11-01T12:05:00.000Z";
const T2 = "2026-11-20T12:00:00.000Z";

const PROVIDER = {
  slug: "savant",
  kind: "openai",
  baseUrl: "https://savant.example",
  keyEnvVar: "PROVIDER_KEY",
};
const SECOND_PROVIDER = {
  slug: "other",
  kind: "openai",
  baseUrl: "https://other.example",
  keyEnvVar: "OTHER_KEY",
};

const DEFAULT_TOKENS = {
  "fp-capital": "Paris",
  "fp-arith": "4",
  "fp-opposite": "cold",
  "fp-code": "a",
  "fp-story": "king",
  "fp-es": "Madrid",
};
const CONTROL_TOKENS = {
  "fp-capital": "Lyon",
  "fp-arith": "7",
  "fp-opposite": "warm",
  "fp-code": "b",
  "fp-story": "queen",
  "fp-es": "Barcelona",
};
const CANARY_ANSWERS = new Map(
  DETERMINISTIC_CANARIES.map((probe) => [probe.prompt, probe.answer]),
);

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

function target(modelId = "model-a", providerSlug = "savant", tools = false) {
  return {
    modelId,
    name: `Model ${modelId}`,
    canonicalKey: "model-a",
    providerSlug,
    upstreamId: modelId,
    protocol: "chat",
    family: "Test",
    contextWindow: "128K",
    access: "free",
    supportsTools: tools,
    costInputMicros: 0,
    costOutputMicros: 0,
    tokenWeight: 1,
  };
}

function estimate(mode = "baseline") {
  return {
    requests: 200,
    promptTokens: 1,
    completionTokens: 1,
    costMicros: 0,
    weightedTokens: 2,
    minutes: 1,
    quotaRemaining: null,
    quotaCheck: "unknown",
    effectiveMode: mode,
    refusals: [],
  };
}

function runInput(protocolId, overrides = {}) {
  return {
    protocolId,
    target: target(),
    provider: PROVIDER,
    control: null,
    mode: "baseline",
    referenceId: null,
    estimate: estimate(),
    now: T0,
    ...overrides,
  };
}

function countsFor(providerSlug) {
  const cells = {};

  for (const cell of FINGERPRINT_CELLS) {
    const token = providerSlug === "refonly" ? `ref-${cell.id}` : DEFAULT_TOKENS[cell.id];

    cells[cell.id] = { n: 20, counts: { [token]: 20 } };
  }

  return { cells };
}

function cellForPrompt(prompt) {
  return FINGERPRINT_CELLS.find((cell) => cell.prompt === prompt) ?? null;
}

function tokenFor(upstreamId, cellId) {
  return upstreamId === "model-control"
    ? CONTROL_TOKENS[cellId]
    : DEFAULT_TOKENS[cellId];
}

function body(input, content, extra = {}) {
  return {
    model: input.target.upstreamId,
    choices: [{ index: 0, message: { role: "assistant", content } }],
    usage: { prompt_tokens: 10, completion_tokens: 1 },
    ...extra,
  };
}

function completion(input, content, extra = {}) {
  const payload = body(input, content, extra);

  return {
    ok: true,
    status: 200,
    bodyText: JSON.stringify(payload),
    content,
    json: payload,
    modelField: input.target.upstreamId,
    promptTokens: 10,
    completionTokens: 1,
    topLogprobs: null,
    errorClass: null,
    latencyMs: 1,
    attempts: 1,
    stream: null,
  };
}

function toolArguments(name) {
  switch (name) {
    case "create_user":
      return { name: "Ada", address: { city: "Paris", zip: "75001" } };
    case "add_items":
      return { items: [{ sku: "A-1", qty: 2 }, { sku: "B-2", qty: 5 }] };
    case "set_mode":
      return { mode: "safe" };
    case "send_note":
      return { to: "ops@example.test", body: "deploy complete" };
    case "run_command":
      return { command: "npm install evnt-stream" };
    case "submit_ticket":
      return { title: "stream check" };
    default:
      return {};
  }
}

function toolRequestName(input) {
  const choice = input.toolChoice;

  return choice?.function?.name ?? null;
}

/**
 * A deterministic fake upstream. The six fingerprint cells drive the whole
 * battery: each returns a fixed single token, the control model returns a
 * different token for every cell, and the rest of the prompts map to their
 * expected answers.
 */
function fakeProbe(db, runId, options = {}) {
  const state = { cancelled: false };
  const messages = (input) => input.messages[1].content;

  async function maybeCancel(input) {
    if (!options.cancelAfterFirstDeterminism || state.cancelled) return;

    if (
      cellForPrompt(messages(input)) &&
      input.sampling.temperature === 0 &&
      input.sampling.max_tokens === 8
    ) {
      state.cancelled = true;
      await requestCancel(db, runId);
    }
  }

  async function request(input) {
    if (options.authFailure) throw new ProbeError("auth", 401, false);

    const prompt = messages(input);

    if (
      options.shapeFailure &&
      prompt === "Reply with the single word OK." &&
      !input.stream
    ) {
      return {
        ...completion(input, ""),
        ok: false,
        status: 200,
        json: null,
        errorClass: "shape",
      };
    }

    await maybeCancel(input);

    const cell = cellForPrompt(prompt);

    if (cell) {
      const content = tokenFor(input.target.upstreamId, cell.id);

      if (!input.logprobs) return completion(input, content);

      return completion(input, content, {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            logprobs: {
              content: [{ token: content, logprob: -0.1, top_logprobs: [] }],
            },
          },
        ],
      });
    }

    const answer = CANARY_ANSWERS.get(prompt);

    if (answer !== undefined) return completion(input, answer);

    const code = /access code for this check is (\S+)\./.exec(prompt);

    if (code) {
      return {
        ...completion(input, code[1]),
        promptTokens: 8_192,
      };
    }

    const toolName = input.tools ? toolRequestName(input) : null;

    if (toolName) {
      return completion(input, "", {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: toolName,
                    arguments: JSON.stringify(toolArguments(toolName)),
                  },
                },
              ],
            },
          },
        ],
      });
    }

    return completion(input, "This request is complete.");
  }

  async function requestStream(input) {
    if (options.authFailure) throw new ProbeError("auth", 401, false);

    const healthy = {
      eventCount: 2,
      terminalCount: 1,
      afterTerminal: 0,
      modelFields: [input.target.upstreamId],
      malformed: 0,
      eventTypes: ["data", "data"],
      usage: [
        { prompt: 10, completion: 5 },
        { prompt: 10, completion: 10 },
      ],
    };

    return {
      ok: true,
      status: 200,
      bodyText:
        'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',
      content: "OK",
      json: null,
      modelField: input.target.upstreamId,
      promptTokens: 10,
      completionTokens: 10,
      topLogprobs: null,
      errorClass: null,
      latencyMs: 1,
      attempts: 1,
      stream: healthy,
    };
  }

  return { request, requestStream };
}

function deps(probe, overrides = {}) {
  return {
    probe,
    now: () => Date.parse(T1),
    resolveProvider: async (slug) =>
      slug === "savant"
        ? PROVIDER
        : slug === "other"
          ? SECOND_PROVIDER
          : undefined,
    randomBytes: (size) => new Uint8Array(size).fill(7),
    maxRequests: 600,
    retentionDays: 90,
    ...overrides,
  };
}

async function startRun(db, overrides = {}) {
  const protocol = await ensureProtocol(db, T0);
  const run = await insertRun(db, runInput(protocol.id, overrides));

  return { protocol, run };
}

test("a baseline run stores the fingerprint reference and a baseline verdict", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db, {
      target: target("model-a", "savant", true),
    });

    await executeRun(db, run.id, deps(fakeProbe(db, run.id)));

    const stored = await getRun(db, run.id);
    const verdict = await getVerdict(db, run.id);
    const counts = await countSamples(db, run.id);
    const references = await db
      .prepare("SELECT COUNT(*)::int AS total FROM identity.references")
      .get();

    assert.equal(stored.status, "completed");
    assert.equal(verdict.status, "baseline");
    assert.equal(verdict.published, 0);
    // 175 requests plus the six tool probes; the route is tool-capable here.
    assert.equal(counts.target, 181);
    assert.equal(references.total, 1);
  } finally {
    await db.close();
  }
});

test("a same-route verify reaches self_consistent against its own baseline", async () => {
  const db = await fixture();

  try {
    const { protocol, run: baseline } = await startRun(db);

    await executeRun(db, baseline.id, deps(fakeProbe(db, baseline.id)));

    const verify = await insertRun(
      db,
      runInput(protocol.id, {
        mode: "verify",
        estimate: estimate("verify"),
        now: T1,
      }),
    );

    await executeRun(db, verify.id, deps(fakeProbe(db, verify.id)));

    const verdict = await getVerdict(db, verify.id);
    const coverage = JSON.parse(verdict.coverageJson);

    assert.equal((await getRun(db, verify.id)).status, "completed");
    assert.equal(verdict.status, "self_consistent");
    assert.equal(coverage.fingerprint.referenceProvider, "same");
    assert.equal((await countSamples(db, verify.id)).target, 187);
  } finally {
    await db.close();
  }
});

test("a second-provider reference plus a discriminative control reaches consistent", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);

    await insertReference(db, {
      canonicalModelKey: "model-a",
      protocolId: protocol.id,
      providerSlug: "other",
      upstreamId: "model-a",
      collectedAt: T0,
      expiresAt: T2,
      counts: countsFor("savant"),
      runId: null,
    });

    const controlRun = await insertRun(
      db,
      runInput(protocol.id, {
        mode: "verify",
        estimate: estimate("verify"),
        now: T1,
        control: {
          target: target("model-control", "other"),
          provider: SECOND_PROVIDER,
        },
      }),
    );

    await executeRun(db, controlRun.id, deps(fakeProbe(db, controlRun.id)));

    const verdict = await getVerdict(db, controlRun.id);
    const coverage = JSON.parse(verdict.coverageJson);

    assert.equal(verdict.status, "consistent");
    assert.equal(coverage.fingerprint.referenceProvider, "second");
    assert.equal(coverage.fingerprint.controlPresent, true);
    assert.equal(coverage.fingerprint.controlDiscriminative, true);
    assert.ok(coverage.fingerprint.controlMeanJsd >= 0.9);
    assert.equal((await countSamples(db, controlRun.id)).diffControl, 120);
  } finally {
    await db.close();
  }
});

test("a target that separates from the reference lands in divergent_review", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);

    await insertReference(db, {
      canonicalModelKey: "model-a",
      protocolId: protocol.id,
      providerSlug: "other",
      upstreamId: "model-a",
      collectedAt: T0,
      expiresAt: T2,
      counts: countsFor("refonly"),
      runId: null,
    });

    const verify = await insertRun(
      db,
      runInput(protocol.id, {
        mode: "verify",
        estimate: estimate("verify"),
        now: T1,
      }),
    );

    await executeRun(db, verify.id, deps(fakeProbe(db, verify.id)));

    const verdict = await getVerdict(db, verify.id);

    assert.equal(verdict.status, "divergent_review");
    assert.equal(verdict.published, 0);
  } finally {
    await db.close();
  }
});

test("a shape failure fails the run before the probe gates run", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db);

    await executeRun(
      db,
      run.id,
      deps(fakeProbe(db, run.id, { shapeFailure: true })),
    );

    const stored = await getRun(db, run.id);
    const verdict = await getVerdict(db, run.id);

    assert.equal(stored.status, "failed");
    assert.equal(stored.errorClass, "shape_failed");
    assert.equal(verdict.status, "error");
    assert.equal(verdict.published, 0);
    assert.equal((await countSamples(db, run.id)).target, 2);
  } finally {
    await db.close();
  }
});

test("a 401 aborts immediately and records an error verdict", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db);

    await executeRun(
      db,
      run.id,
      deps(fakeProbe(db, run.id, { authFailure: true })),
    );

    const stored = await getRun(db, run.id);
    const verdict = await getVerdict(db, run.id);

    assert.equal(stored.status, "failed");
    assert.equal(stored.errorClass, "probe_error");
    assert.equal(stored.errorMessage, "auth");
    assert.equal(verdict.status, "error");
    assert.equal((await countSamples(db, run.id)).target, 0);
  } finally {
    await db.close();
  }
});

test("a cancellation request between gates marks the run cancelled", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db);

    await executeRun(
      db,
      run.id,
      deps(fakeProbe(db, run.id, { cancelAfterFirstDeterminism: true })),
    );

    const stored = await getRun(db, run.id);

    assert.equal(stored.status, "cancelled");
    assert.equal(await getVerdict(db, run.id), null);
    assert.ok((await countSamples(db, run.id)).target < 175);
  } finally {
    await db.close();
  }
});

test("exceeding the request cap fails the run instead of truncating it", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db);

    await executeRun(db, run.id, deps(fakeProbe(db, run.id), { maxRequests: 5 }));

    const stored = await getRun(db, run.id);
    const verdict = await getVerdict(db, run.id);

    assert.equal(stored.status, "failed");
    assert.equal(stored.errorClass, "request_cap");
    assert.equal(verdict.status, "error");
  } finally {
    await db.close();
  }
});

test("a second executeRun on the same row does not re-run it", async () => {
  const db = await fixture();

  try {
    const { run } = await startRun(db);

    await executeRun(db, run.id, deps(fakeProbe(db, run.id)));

    const before = await countSamples(db, run.id);

    await executeRun(db, run.id, deps(fakeProbe(db, run.id)));
    await executeRun(db, run.id, deps(fakeProbe(db, run.id)));

    assert.equal((await getRun(db, run.id)).status, "completed");
    assert.deepEqual(await countSamples(db, run.id), before);
    assert.equal((await getVerdict(db, run.id)).status, "baseline");
  } finally {
    await db.close();
  }
});
