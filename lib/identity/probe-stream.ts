import type { ProbeRequest, StreamEvidence } from "./probe-client.ts";

/**
 * Wire-shape helpers for the identity probe client (FID-087).
 *
 * Body construction and SSE parsing are pure functions over bytes and strings.
 * They live apart from the retry and rate-limit loop so neither file crosses
 * the 400-line ceiling, and so the parser can be reasoned about without the
 * transport around it.
 */

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function buildBody(input: ProbeRequest, stream: boolean) {
  const body: Record<string, unknown> = {
    model: input.target.upstreamId,
    messages: input.messages,
    temperature: input.sampling.temperature,
    top_p: input.sampling.top_p,
    max_tokens: input.sampling.max_tokens,
    n: input.sampling.n ?? 1,
  };

  if (stream) body.stream = true;
  if (input.tools && input.tools.length > 0) body.tools = input.tools;
  if (input.toolChoice !== undefined) body.tool_choice = input.toolChoice;
  if (input.logprobs) {
    body.logprobs = true;
    body.top_logprobs = input.topLogprobs ?? 5;
  }

  return body;
}

export async function readAll(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

export type ParsedStream = StreamEvidence & { content: string };

export function parseStream(bodyText: string): ParsedStream {
  const evidence: ParsedStream = {
    eventCount: 0,
    terminalCount: 0,
    afterTerminal: 0,
    modelFields: [],
    usage: [],
    malformed: 0,
    eventTypes: [],
    content: "",
  };

  for (const rawLine of bodyText.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payload = rawLine.slice(5).trim();

    if (!payload) continue;
    if (payload === "[DONE]") {
      evidence.terminalCount += 1;
      continue;
    }
    if (evidence.terminalCount > 0) evidence.afterTerminal += 1;
    evidence.eventCount += 1;
    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      evidence.malformed += 1;
      continue;
    }
    const event = record(parsed);

    if (!event) {
      evidence.malformed += 1;
      continue;
    }
    evidence.eventTypes.push(
      event.error
        ? "error"
        : typeof event.type === "string"
          ? event.type
          : typeof event.object === "string"
            ? event.object
            : "data",
    );
    const model = text(event.model);

    if (model) evidence.modelFields.push(model);
    const usage = record(event.usage);

    if (usage) {
      evidence.usage.push({
        prompt: integer(usage.prompt_tokens),
        completion: integer(usage.completion_tokens),
      });
    }
    for (const entry of Array.isArray(event.choices) ? event.choices : []) {
      const choice = record(entry);
      const delta = record(choice?.delta);
      const message = record(choice?.message);
      const piece =
        typeof delta?.content === "string"
          ? delta.content
          : typeof message?.content === "string"
            ? message.content
            : "";

      if (piece) evidence.content += piece;
    }
  }

  return evidence;
}
