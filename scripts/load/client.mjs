import { setTimeout as sleep } from "node:timers/promises";

export async function jsonCall(
  baseUrl,
  secret,
  { model, content, maxTokens = 64, timeoutMs = 15_000 },
) {
  const started = performance.now();

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    return {
      status: response.status,
      headers: response.headers,
      text,
      json,
      latencyMs: performance.now() - started,
      transportError: null,
    };
  } catch (error) {
    return {
      status: 0,
      headers: new Headers(),
      text: "",
      json: null,
      latencyMs: performance.now() - started,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Opens a real SSE response. `started` resolves once headers (and the first
 * chunk, when one arrives) are visible; `done` resolves with the complete
 * client observation. A caller may abandon the reader, which is how a client
 * disconnect is exercised against the running gateway.
 */
export function openStream(
  baseUrl,
  secret,
  { model, content, maxTokens = 64, cancelAfterBytes = null, timeoutMs = 20_000 },
) {
  let startedResolve;
  const started = new Promise((resolve) => {
    startedResolve = resolve;
  });
  let finishStarted = false;
  const markStarted = (value) => {
    if (finishStarted) return;

    finishStarted = true;
    startedResolve(value);
  };

  const done = (async () => {
    const began = performance.now();
    let text = "";
    let bytes = 0;
    let status = 0;

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      status = response.status;

      if (!response.ok) {
        text = await response.text();
        markStarted({ status, opened: false });

        return {
          status,
          text,
          bytes,
          latencyMs: performance.now() - began,
          cancelled: false,
          completed: false,
          transportError: null,
        };
      }

      const reader = response.body?.getReader();

      if (!reader) {
        markStarted({ status, opened: false });

        return {
          status,
          text,
          bytes,
          latencyMs: performance.now() - began,
          cancelled: false,
          completed: false,
          transportError: "empty response body",
        };
      }

      const decoder = new TextDecoder();
      let cancelled = false;

      while (true) {
        const chunk = await reader.read();

        if (chunk.done) break;

        bytes += chunk.value.byteLength;
        text += decoder.decode(chunk.value, { stream: true });
        markStarted({ status, opened: true });

        if (cancelAfterBytes !== null && bytes >= cancelAfterBytes) {
          await reader.cancel();
          cancelled = true;
          break;
        }
      }

      text += decoder.decode();

      return {
        status,
        text,
        bytes,
        latencyMs: performance.now() - began,
        cancelled,
        completed: text.includes("[DONE]"),
        transportError: null,
      };
    } catch (error) {
      markStarted({ status, opened: false });

      return {
        status,
        text,
        bytes,
        latencyMs: performance.now() - began,
        cancelled: false,
        completed: false,
        transportError: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  return { started, done };
}

export async function waitFor(predicate, { timeoutMs = 10_000, intervalMs = 50 }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await predicate();

    if (value) return value;

    await sleep(intervalMs);
  }

  return null;
}
