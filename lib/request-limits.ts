import { isJsonObject } from "./http.ts";
import { MAX_OUTPUT_BUDGET } from "./pricing.ts";

export const MANAGEMENT_BODY_BYTES = 65_536;
export const COMPLETION_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_STREAM_BYTES = 32 * 1024 * 1024;
export const MAX_STREAM_FRAME_BYTES = 1024 * 1024;
const BODY_TIMEOUT_MS = 10_000;
const MAX_DEPTH = 32;
const MAX_NODES = 20_000;

export class RequestBodyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Counts actual bytes: a missing or dishonest Content-Length grants no bypass. */
export async function readBoundedText(
  request: Request,
  maxBytes = MANAGEMENT_BODY_BYTES,
  timeoutMs = BODY_TIMEOUT_MS,
) {
  const length = request.headers.get("content-length");

  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new RequestBodyError(413, "Request body exceeds the byte limit.");
  }

  const reader = request.body?.getReader();

  if (!reader) return "";

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError(408, "Request body timed out."));
    }, timeoutMs);
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);

      if (chunk.done) return text + decoder.decode();

      size += chunk.value.byteLength;

      if (size > maxBytes) {
        throw new RequestBodyError(413, "Request body exceeds the byte limit.");
      }

      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    // Cancellation is best effort; waiting for a hostile source's cancel
    // promise would defeat the read deadline itself.
    void reader.cancel().catch(() => {});
    throw error instanceof RequestBodyError
      ? error
      : new RequestBodyError(400, "Invalid request body.");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function validateStructure(root: Record<string, unknown>) {
  const pending = [{ value: root as unknown, depth: 0 }];
  let count = 0;

  while (pending.length) {
    const item = pending.pop();

    if (!item) break;
    count += 1;

    if (count > MAX_NODES || item.depth > MAX_DEPTH) {
      throw new RequestBodyError(
        413,
        "JSON structure exceeds the resource limit.",
      );
    }

    if (item.value !== null && typeof item.value === "object") {
      for (const value of Object.values(item.value)) {
        pending.push({ value, depth: item.depth + 1 });
      }
    }
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = MANAGEMENT_BODY_BYTES,
) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readBoundedText(request, maxBytes));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "Invalid JSON body.");
  }

  if (!isJsonObject(parsed)) {
    throw new RequestBodyError(400, "Request body must be a JSON object.");
  }

  validateStructure(parsed);

  return parsed;
}

export function requestBodyError(error: unknown) {
  const problem =
    error instanceof RequestBodyError
      ? error
      : new RequestBodyError(400, "Invalid JSON body.");

  return Response.json(
    { error: problem.message },
    {
      status: problem.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/** Validate all supplied aliases, before defaults, rate checks or reservations. */
export function completionResourceProblem(body: Record<string, unknown>) {
  if (body.n !== undefined && body.n !== 1) {
    return "Only n=1 is supported.";
  }

  for (const name of ["max_tokens", "max_completion_tokens"]) {
    const value = body[name];

    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > MAX_OUTPUT_BUDGET)
    )
      return `${name} must be an integer from 1 to ${MAX_OUTPUT_BUDGET}.`;
  }

  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return "stream must be a boolean.";
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 256
  )
    return "messages must contain 1 to 256 entries.";

  for (const message of body.messages) {
    if (
      !isJsonObject(message) ||
      typeof message.role !== "string" ||
      ![
        "system",
        "developer",
        "user",
        "assistant",
        "tool",
        "function",
      ].includes(message.role)
    ) {
      return "Each message must be an object with a supported role.";
    }
  }

  for (const name of ["tools", "functions"]) {
    const value = body[name];

    if (value !== undefined && (!Array.isArray(value) || value.length > 128)) {
      return `${name} must be an array with at most 128 entries.`;
    }
  }

  return null;
}
