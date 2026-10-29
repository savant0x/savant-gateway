import {
  finishReason,
  readUsage,
  record,
  type JsonRecord,
} from "./anthropic-shared.ts";

/** Translates a non-streaming Anthropic Messages response into Chat Completions. */
export function toOpenAiCompletion(payload: JsonRecord, fallbackModel = "") {
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .map((block) => {
      const entry = record(block);

      return entry?.type === "text" && typeof entry.text === "string"
        ? entry.text
        : "";
    })
    .join("");
  const toolCalls = blocks.flatMap((block) => {
    const entry = record(block);

    if (entry?.type !== "tool_use" || typeof entry.name !== "string") return [];

    return [
      {
        id: typeof entry.id === "string" ? entry.id : `tool_${entry.name}`,
        type: "function",
        function: {
          name: entry.name,
          arguments: JSON.stringify(entry.input ?? {}),
        },
      },
    ];
  });
  const usage = readUsage(payload);

  return {
    id: typeof payload.id === "string" ? payload.id : `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: typeof payload.model === "string" ? payload.model : fallbackModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason(payload.stop_reason),
      },
    ],
    usage,
  };
}
