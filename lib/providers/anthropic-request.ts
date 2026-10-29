import { record, type JsonRecord } from "./anthropic-shared.ts";

const DEFAULT_MAX_TOKENS = 4096;

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const block = record(part);

      return block?.type === "text" && typeof block.text === "string"
        ? block.text
        : "";
    })
    .join("");
}

function contentBlocks(content: unknown) {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }

  if (!Array.isArray(content)) return [];

  const blocks: JsonRecord[] = [];

  for (const part of content) {
    const block = record(part);

    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
      continue;
    }

    const image = record(block.image_url);
    const url = typeof image?.url === "string" ? image.url : "";

    if (block.type === "image_url" && url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);

      if (match) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1],
            data: match[2],
          },
        });
      }
    }
  }

  return blocks;
}

function readToolCalls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const call = record(entry);
    const fn = record(call?.function);
    const name = typeof fn?.name === "string" ? fn.name : "";

    if (!call || !name) return [];

    let input: unknown = {};

    if (typeof fn?.arguments === "string" && fn.arguments.trim()) {
      try {
        input = JSON.parse(fn.arguments);
      } catch {
        input = {};
      }
    }

    return [
      {
        type: "tool_use",
        id: typeof call.id === "string" ? call.id : `tool_${name}`,
        name,
        input,
      },
    ];
  });
}

function readMessages(messages: unknown) {
  const system: string[] = [];
  const output: Array<{ role: "user" | "assistant"; content: JsonRecord[] }> =
    [];

  if (!Array.isArray(messages)) return { system, messages: output };

  const push = (role: "user" | "assistant", content: JsonRecord[]) => {
    if (content.length === 0) return;

    const last = output[output.length - 1];

    if (last && last.role === role) last.content.push(...content);
    else output.push({ role, content });
  };

  for (const entry of messages) {
    const message = record(entry);
    const role = message?.role;

    if (!message || typeof role !== "string") continue;

    if (role === "system" || role === "developer") {
      const text = textFromContent(message.content);

      if (text) system.push(text);
      continue;
    }

    if (role === "tool") {
      const text = textFromContent(message.content);

      push("user", [
        {
          type: "tool_result",
          tool_use_id:
            typeof message.tool_call_id === "string"
              ? message.tool_call_id
              : "",
          content: text,
        },
      ]);
      continue;
    }

    if (role !== "user" && role !== "assistant") continue;

    const blocks: JsonRecord[] = [...contentBlocks(message.content)];

    if (role === "assistant") {
      blocks.push(...readToolCalls(message.tool_calls));
    }

    push(role, blocks);
  }

  return { system, messages: output };
}

function readTools(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const tools = value.flatMap((entry) => {
    const tool = record(entry);

    if (tool?.type !== "function") return [];
    const fn = record(tool.function);
    const name = typeof fn?.name === "string" ? fn.name : "";

    if (!name) return [];

    return [
      {
        name,
        description: typeof fn?.description === "string" ? fn.description : "",
        input_schema: record(fn?.parameters) ?? { type: "object" },
      },
    ];
  });

  return tools.length > 0 ? tools : undefined;
}

function readToolChoice(value: unknown) {
  if (typeof value === "string") {
    if (value === "required") return { type: "any" };
    if (value === "auto") return { type: "auto" };

    return undefined;
  }

  const choice = record(value);
  const name = record(choice?.function)?.name;

  return choice?.type === "function" && typeof name === "string"
    ? { type: "tool", name }
    : undefined;
}

/** Translates an OpenAI Chat Completions body into Anthropic Messages. */
export function toAnthropicRequest(body: JsonRecord, maxTokens?: number) {
  const translated = readMessages(body.messages);
  const requested =
    Number(body.max_tokens ?? body.max_completion_tokens ?? maxTokens) ||
    DEFAULT_MAX_TOKENS;
  const tools = readTools(body.tools);
  const toolChoice = readToolChoice(body.tool_choice);
  const output: JsonRecord = {
    model: body.model,
    max_tokens: Math.max(1, Math.floor(requested)),
    messages: translated.messages,
  };

  if (translated.system.length > 0) {
    output.system = translated.system.join("\n\n");
  }
  if (typeof body.temperature === "number") {
    output.temperature = body.temperature;
  }
  if (typeof body.top_p === "number") output.top_p = body.top_p;
  if (body.stop !== undefined) {
    output.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }
  if (tools) output.tools = tools;
  if (toolChoice) output.tool_choice = toolChoice;
  if (body.stream === true) output.stream = true;

  return output;
}
