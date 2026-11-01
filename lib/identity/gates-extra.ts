import type { IdentityCounts } from "./types.ts";

import {
  FINGERPRINT_CELLS,
  SAMPLING,
  STREAM_PROBES,
  TOOL_PROBES,
  type ToolProbe,
} from "./battery.ts";
import { modalToken, normalizeResponse } from "./normalize.ts";
import { ask, type GateContext, type GateResult } from "./gates.ts";

export { runContext } from "./gates-context.ts";
export type { ContextGate } from "./gates-context.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validType(type: unknown, value: unknown): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return record(value) !== null;

  return true;
}

function validateSchema(
  schema: Record<string, unknown>,
  value: unknown,
): boolean {
  if (!validType(schema.type, value)) return false;

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;

  if (schema.type === "object") {
    const object = record(value);

    if (!object) return false;

    const properties = record(schema.properties) ?? {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of required) {
      if (typeof key !== "string" || !(key in object)) return false;
    }

    for (const [key, entry] of Object.entries(object)) {
      const child = record(properties[key]);

      if (!child) {
        if (schema.additionalProperties === false) return false;
        continue;
      }

      if (!validateSchema(child, entry)) return false;
    }
  }

  if (schema.type === "array") {
    const item = record(schema.items);

    if (!item) return true;
    if (!Array.isArray(value)) return false;

    return value.every((entry) => validateSchema(item, entry));
  }

  return true;
}

function toolCallFor(result: { json: Record<string, unknown> | null }) {
  const choices = Array.isArray(result.json?.choices)
    ? result.json.choices
    : [];
  const first = record(choices[0]);
  const message = record(first?.message);
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const call = record(calls[0]);
  const fn = record(call?.function);
  const name = typeof fn?.name === "string" ? fn.name : null;
  const raw = typeof fn?.arguments === "string" ? fn.arguments : null;

  if (!name || !raw) return null;

  try {
    return { name, arguments: JSON.parse(raw) as unknown };
  } catch {
    return null;
  }
}

function toolMatches(probe: ToolProbe, name: string, args: unknown) {
  if (name !== probe.tool.name) return false;

  const object = record(args);

  if (!object) return false;

  if (!validateSchema(probe.tool.parameters, object)) return false;

  if (probe.expect.kind === "command") {
    return object.command === probe.expect.value;
  }

  if (probe.expect.kind === "enum" && probe.expect.value) {
    return object.mode === probe.expect.value;
  }

  return true;
}

export async function runTools(context: GateContext): Promise<GateResult> {
  if (!context.target.supportsTools) {
    return {
      state: "not_tested",
      n: 0,
      note: "The model is not published as tool-capable.",
      evidence: { supported: false },
    };
  }

  let passed = 0;
  let failed = 0;
  let unsupported = 0;

  for (const probe of TOOL_PROBES) {
    const result = await ask(
      context,
      `tools:${probe.id}`,
      "target",
      0,
      probe.prompt,
      SAMPLING.tools,
      {
        tools: [{ type: "function", function: probe.tool }],
        toolChoice: {
          type: "function",
          function: { name: probe.tool.name },
        },
      },
    );

    if (!result.ok) {
      if ([400, 404, 422].includes(result.status)) unsupported += 1;
      else failed += 1;
      continue;
    }

    const call = toolCallFor(result);

    if (call && toolMatches(probe, call.name, call.arguments)) passed += 1;
    else failed += 1;
  }

  const state =
    unsupported === TOOL_PROBES.length
      ? "not_tested"
      : failed > 0
        ? "fail"
        : passed === TOOL_PROBES.length
          ? "pass"
          : "inconclusive";

  return {
    state,
    n: TOOL_PROBES.length,
    note:
      state === "pass"
        ? null
        : state === "fail"
          ? "A tool call was malformed or rewritten."
          : "The route did not accept the tool probes.",
    evidence: { passed, failed, unsupported },
  };
}

const ECHO_TOOL = {
  type: "function",
  function: {
    name: "echo",
    description: "Echo the supplied text.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
  },
};

function usageMonotonic(
  usage: Array<{ prompt: number | null; completion: number | null }>,
) {
  let previous = -1;

  for (const entry of usage) {
    if (entry.completion === null) continue;
    if (entry.completion < previous) return false;
    previous = entry.completion;
  }

  return true;
}

export async function runStreams(context: GateContext): Promise<GateResult> {
  let passed = 0;
  const failures: string[] = [];

  for (const probe of STREAM_PROBES) {
    const tool = "tool" in probe ? probe.tool : undefined;
    const result = await ask(
      context,
      `stream:${probe.id}`,
      "target",
      0,
      probe.prompt,
      SAMPLING.stream,
      {
        stream: true,
        tools: tool ? [ECHO_TOOL] : undefined,
        toolChoice: tool
          ? { type: "function", function: { name: tool } }
          : undefined,
      },
    );

    const evidence = result.stream;
    const models = new Set(evidence?.modelFields ?? []);
    const valid =
      result.ok &&
      evidence !== null &&
      evidence.terminalCount === 1 &&
      evidence.afterTerminal === 0 &&
      evidence.malformed === 0 &&
      models.size <= 1 &&
      usageMonotonic(evidence.usage);

    if (valid) passed += 1;
    else failures.push(probe.id);
  }

  return {
    state:
      passed === STREAM_PROBES.length
        ? "pass"
        : failures.length === STREAM_PROBES.length
          ? "fail"
          : "inconclusive",
    n: STREAM_PROBES.length,
    note:
      passed === STREAM_PROBES.length
        ? null
        : "One or more streams violated the protocol invariants.",
    evidence: { passed, failed: STREAM_PROBES.length - passed, failures },
  };
}

function topToken(result: { json: Record<string, unknown> | null }) {
  const choices = Array.isArray(result.json?.choices)
    ? result.json.choices
    : [];
  const first = record(choices[0]);
  const logprobs = record(first?.logprobs);
  const content = Array.isArray(logprobs?.content) ? logprobs.content : [];
  const entry = record(content[0]);
  const token = entry?.token;

  return typeof token === "string" ? normalizeResponse(token) : null;
}

export async function runLogprobs(
  context: GateContext,
  reference: IdentityCounts | null,
): Promise<GateResult> {
  if (!reference) {
    return {
      state: "not_tested",
      n: 0,
      note: "No reference distribution exists; top-1 agreement is not comparable.",
      evidence: { supported: false },
    };
  }

  let supported = 0;
  let agreement = 0;
  let unavailable = 0;

  for (const cell of FINGERPRINT_CELLS) {
    if (!reference.cells[cell.id]) continue;

    for (let iteration = 0; iteration < 2; iteration += 1) {
      const result = await ask(
        context,
        `logprobs:${cell.id}`,
        "target",
        iteration,
        cell.prompt,
        SAMPLING.logprobs,
        { logprobs: true, topLogprobs: 5 },
      );

      if (!result.ok) {
        unavailable += 1;
        continue;
      }

      const token = topToken(result);

      if (!token) {
        unavailable += 1;
        continue;
      }

      supported += 1;

      const referenceCell = reference.cells[cell.id];
      const modal = referenceCell ? modalToken(referenceCell.counts) : null;

      if (modal && token === modal) agreement += 1;
    }
  }

  if (supported === 0) {
    return {
      state: "not_tested",
      n: 0,
      note: "The route did not return top log probabilities.",
      evidence: { supported: false, unavailable },
    };
  }

  return {
    state: supported >= 10 && agreement >= 10 ? "pass" : "inconclusive",
    n: supported,
    note:
      supported >= 10 && agreement >= 10
        ? null
        : "Top-1 agreement is descriptive and did not clear the reporting bar.",
    evidence: { supported, agreement, unavailable },
  };
}
