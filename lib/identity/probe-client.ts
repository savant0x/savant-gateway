import {
  anthropicStream,
  toAnthropicRequest,
  toOpenAiCompletion,
} from "../providers/anthropic-translate.ts";

import {
  buildBody,
  integer,
  parseStream,
  readAll,
  record,
  text,
} from "./probe-stream.ts";

export type ProbeProvider = {
  slug: string;
  kind: "openai" | "anthropic" | "both";
  baseUrl: string;
  keyEnvVar: string;
};

export type ProbeDeps = {
  fetch: typeof fetch;
  headers: (provider: ProbeProvider) => Record<string, string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  randomBytes: (size: number) => Uint8Array;
};

export type ProbeSampling = {
  temperature: number;
  top_p: number;
  max_tokens: number;
  n?: number;
};

export type ProbeRequest = {
  provider: ProbeProvider;
  target: { protocol: "chat" | "messages"; upstreamId: string };
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  sampling: ProbeSampling;
  stream?: boolean;
  tools?: unknown[];
  toolChoice?: unknown;
  logprobs?: boolean;
  topLogprobs?: number;
};

export type StreamEvidence = {
  eventCount: number;
  terminalCount: number;
  afterTerminal: number;
  modelFields: string[];
  malformed: number;
  eventTypes: string[];
  usage: Array<{ prompt: number | null; completion: number | null }>;
};

export type ProbeResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  content: string;
  json: Record<string, unknown> | null;
  modelField: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  topLogprobs: unknown;
  errorClass: string | null;
  latencyMs: number;
  attempts: number;
  stream: StreamEvidence | null;
};

export class ProbeError extends Error {
  readonly errorClass: string;
  readonly status: number;
  readonly retryable: boolean;
  constructor(
    errorClass: string,
    status: number,
    retryable: boolean,
    message = errorClass,
  ) {
    super(message);
    this.name = "ProbeError";
    this.errorClass = errorClass;
    this.status = status;
    this.retryable = retryable;
  }
}

export type ProbeClient = {
  request(input: ProbeRequest): Promise<ProbeResult>;
  requestStream(input: ProbeRequest): Promise<ProbeResult>;
};

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKOFF = [1_000, 4_000, 9_000];
const MAX_RETRY_AFTER = 60_000;

function parseBody(value: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function retryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER, seconds * 1_000);
  }
  const date = Date.parse(value);

  return Number.isFinite(date)
    ? Math.min(MAX_RETRY_AFTER, Math.max(0, date - Date.now()))
    : null;
}

function errorClassFor(status: number) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "http_5xx";

  return "http_4xx";
}

function shapeFailure(
  response: Response,
  bodyText: string,
  json: Record<string, unknown> | null,
  attempts: number,
  latencyMs: number,
): ProbeResult {
  return {
    ok: false,
    status: response.status,
    bodyText,
    json,
    content: "",
    modelField: null,
    promptTokens: null,
    completionTokens: null,
    topLogprobs: null,
    latencyMs,
    attempts,
    stream: null,
    errorClass: response.ok ? "shape" : errorClassFor(response.status),
  };
}

export function createProbeClient(
  deps: ProbeDeps,
  options: { rpm?: number; maxAttempts?: number; timeoutMs?: number } = {},
): ProbeClient {
  const rpm = Math.min(60, Math.max(1, options.rpm ?? 10));
  const maxAttempts = Math.min(3, Math.max(1, options.maxAttempts ?? 3));
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 20_000);
  const interval = 60_000 / rpm;
  let lastStart: number | null = null;

  async function waitForSlot() {
    if (lastStart !== null) {
      const elapsed = deps.now() - lastStart;

      if (elapsed < interval) await deps.sleep(interval - elapsed);
    }
    lastStart = deps.now();
  }

  async function send(input: ProbeRequest, stream: boolean) {
    const url = `${input.provider.baseUrl.replace(/\/+$/, "")}${
      input.target.protocol === "messages" ? "/messages" : "/chat/completions"
    }`;
    const body = buildBody(input, stream);
    const wireBody =
      input.target.protocol === "messages" ? toAnthropicRequest(body) : body;
    let lastClass = "network";
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await waitForSlot();
      let response: Response;

      try {
        response = await deps.fetch(url, {
          method: "POST",
          headers: {
            ...deps.headers(input.provider),
            "Content-Type": "application/json",
            Accept: stream ? "text/event-stream" : "application/json",
          },
          body: JSON.stringify(wireBody),
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timeout =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");

        lastClass = timeout ? "timeout" : "network";
        lastStatus = 0;
        if (attempt === maxAttempts) {
          throw new ProbeError(lastClass, lastStatus, true);
        }
        await deps.sleep(BACKOFF[attempt - 1] ?? BACKOFF[2]);
        continue;
      }
      if (response.ok) return { response, attempts: attempt };
      if (response.status === 401 || response.status === 403) {
        throw new ProbeError("auth", response.status, false);
      }
      if (!RETRYABLE.has(response.status)) {
        return { response, attempts: attempt };
      }
      lastClass = errorClassFor(response.status);
      lastStatus = response.status;
      if (response.body) await response.body.cancel().catch(() => {});
      if (attempt === maxAttempts) {
        throw new ProbeError(lastClass, lastStatus, true);
      }
      await deps.sleep(
        retryAfterMs(response.headers.get("retry-after")) ??
          BACKOFF[attempt - 1] ??
          BACKOFF[2],
      );
    }
    throw new ProbeError(lastClass, lastStatus, true);
  }

  async function request(input: ProbeRequest): Promise<ProbeResult> {
    const started = deps.now();
    const { response, attempts } = await send(input, false);
    const bodyText = await response.text();
    const parsed = parseBody(bodyText);
    const latencyMs = deps.now() - started;

    if (!response.ok || !parsed) {
      return shapeFailure(
        response,
        bodyText.slice(0, 200),
        parsed,
        attempts,
        latencyMs,
      );
    }
    const json: Record<string, unknown> =
      input.target.protocol === "messages"
        ? (toOpenAiCompletion(parsed, input.target.upstreamId) as Record<
            string,
            unknown
          >)
        : parsed;
    const choices = Array.isArray(json.choices) ? json.choices : [];

    if (choices.length === 0) {
      return shapeFailure(
        response,
        bodyText.slice(0, 200),
        json,
        attempts,
        latencyMs,
      );
    }
    const first = record(choices[0]);
    const message = record(first?.message);
    const usage = record(json.usage);

    return {
      ok: true,
      status: response.status,
      bodyText,
      json,
      content: typeof message?.content === "string" ? message.content : "",
      modelField: text(json.model),
      latencyMs,
      attempts,
      stream: null,
      promptTokens: integer(usage?.prompt_tokens),
      completionTokens: integer(usage?.completion_tokens),
      topLogprobs: first?.logprobs ?? null,
      errorClass: null,
    };
  }

  async function requestStream(input: ProbeRequest): Promise<ProbeResult> {
    const started = deps.now();
    const { response, attempts } = await send(input, true);

    if (!response.ok) {
      const bodyText = (await response.text()).slice(0, 200);

      return shapeFailure(
        response,
        bodyText,
        parseBody(bodyText),
        attempts,
        deps.now() - started,
      );
    }
    if (!response.body) {
      return shapeFailure(response, "", null, attempts, deps.now() - started);
    }
    const body =
      input.target.protocol === "messages"
        ? anthropicStream(response.body)
        : response.body;
    const bodyText = await readAll(body);
    const stream = parseStream(bodyText);
    const streamOk = stream.terminalCount === 1 && stream.afterTerminal === 0;

    return {
      ok: streamOk,
      status: response.status,
      bodyText,
      json: null,
      content: stream.content,
      modelField: stream.modelFields[0] ?? null,
      latencyMs: deps.now() - started,
      attempts,
      stream,
      topLogprobs: null,
      promptTokens: stream.usage[0]?.prompt ?? null,
      completionTokens: stream.usage.reduce<number | null>(
        (latest, entry) => entry.completion ?? latest,
        null,
      ),
      errorClass: streamOk ? null : "stream_shape",
    };
  }

  return { request, requestStream };
}
