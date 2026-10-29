import { finishReason, record, type JsonRecord } from "./anthropic-shared.ts";

type StreamState = {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  finish: string;
  started: boolean;
  finished: boolean;
  tools: Map<number, number>;
  nextTool: number;
};

function sse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Converts Anthropic Messages SSE events into OpenAI `chat.completion.chunk`
 * events, including a final usage chunk. The gateway relay is protocol-neutral.
 */
export function anthropicStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const state: StreamState = {
    id: `chatcmpl_${Date.now()}`,
    model: "",
    inputTokens: 0,
    outputTokens: 0,
    finish: "stop",
    started: false,
    finished: false,
    tools: new Map(),
    nextTool: 0,
  };

  function chunk(choices: unknown[], usage?: unknown) {
    return {
      id: state.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: state.model,
      choices,
      ...(usage ? { usage } : {}),
    };
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      const send = (payload: unknown) =>
        controller.enqueue(new TextEncoder().encode(sse(payload)));
      const start = () => {
        if (state.started) return;

        state.started = true;
        send(
          chunk([
            {
              index: 0,
              delta: { role: "assistant", content: "" },
              finish_reason: null,
            },
          ]),
        );
      };
      const finish = () => {
        if (state.finished) return;

        state.finished = true;
        start();
        send(
          chunk(
            [{ index: 0, delta: {}, finish_reason: state.finish }],
            undefined,
          ),
        );
        send(
          chunk([], {
            prompt_tokens: state.inputTokens,
            completion_tokens: state.outputTokens,
            total_tokens: state.inputTokens + state.outputTokens,
          }),
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      };

      const handle = (raw: string) => {
        const line = raw.replace(/\r$/, "");

        if (!line.startsWith("data:")) return;

        const payload = line.slice(5).trim();

        if (!payload) return;

        let event: JsonRecord;

        try {
          event = record(JSON.parse(payload)) ?? {};
        } catch {
          return;
        }

        const type = event.type;

        if (type === "message_start") {
          const message = record(event.message) ?? {};

          state.id = typeof message.id === "string" ? message.id : state.id;
          state.model =
            typeof message.model === "string" ? message.model : state.model;
          const usage = record(message.usage);

          state.inputTokens = Number(usage?.input_tokens ?? 0);
          start();

          return;
        }

        if (type === "content_block_start") {
          const block = record(event.content_block);

          if (block?.type === "tool_use" && typeof block.name === "string") {
            const index = Number(event.index ?? 0);
            const toolIndex = state.nextTool++;

            state.tools.set(index, toolIndex);
            start();
            send(
              chunk([
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: toolIndex,
                        id:
                          typeof block.id === "string"
                            ? block.id
                            : `tool_${block.name}`,
                        type: "function",
                        function: { name: block.name, arguments: "" },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ]),
            );
          }

          return;
        }

        if (type === "content_block_delta") {
          const delta = record(event.delta);

          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            start();
            send(
              chunk([
                {
                  index: 0,
                  delta: { content: delta.text },
                  finish_reason: null,
                },
              ]),
            );
          } else if (
            delta?.type === "input_json_delta" &&
            typeof delta.partial_json === "string"
          ) {
            const toolIndex = state.tools.get(Number(event.index ?? 0));

            if (toolIndex !== undefined) {
              send(
                chunk([
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: toolIndex,
                          function: { arguments: delta.partial_json },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ]),
              );
            }
          }

          return;
        }

        if (type === "message_delta") {
          const delta = record(event.delta);
          const usage = record(event.usage);

          state.finish = finishReason(delta?.stop_reason);
          state.outputTokens = Number(usage?.output_tokens ?? 0);

          return;
        }

        if (type === "error") {
          const error = record(event.error);

          if (!state.finished) {
            state.finished = true;
            send({
              error: {
                message: String(error?.message ?? "Anthropic stream failed"),
                type: "upstream_error",
              },
            });
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          }

          return;
        }

        if (type === "message_stop") finish();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");

          while (newline >= 0) {
            handle(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
        }

        if (buffer.trim()) handle(buffer);
        finish();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
