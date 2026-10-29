export type JsonRecord = Record<string, unknown>;

export function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function finishReason(reason: unknown) {
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_calls";

  return "stop";
}

export function readUsage(payload: JsonRecord) {
  const usage = record(payload.usage) ?? {};

  return {
    prompt_tokens: Number(usage.input_tokens ?? 0),
    completion_tokens: Number(usage.output_tokens ?? 0),
    total_tokens:
      Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0),
  };
}
