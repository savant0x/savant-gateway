#!/usr/bin/env node
/**
 * Bounded upstream speed probe.
 *
 * Answers one question per provider and model: how long does a streamed
 * completion take to its first content token, how fast does it generate after
 * that, and how often is the caller refused (429) rather than served?
 *
 * It is deliberately small and dependency-free because it runs against real,
 * billed upstream accounts. Safety properties:
 *
 * 1. **Dry run by default.** Nothing is sent unless `--execute` is present.
 * 2. **Hard request cap.** The plan is refused when it exceeds `--max-requests`
 *    (default 40), so a typo cannot turn into a thousand paid calls.
 * 3. **Sequential, paced.** One request at a time, `--interval-ms` apart, which
 *    keeps a two-arm run well under the account's 15 requests per minute.
 * 4. **No secrets and no bodies.** Only status, timings, token counts and
 *    rate-limit headers are recorded. Credentials never reach stdout or the
 *    output file, and response text is never stored.
 * 5. **No retries.** A refusal is a measurement, not a transient to hide.
 *
 * Usage:
 *   node --env-file=.env.local scripts/upstream-speed-probe.mjs
 *   node --env-file=.env.local scripts/upstream-speed-probe.mjs --execute \
 *     --arm=apinex --models=free/gpt-6-luna --samples=2 --max-tokens=96 \
 *     --interval-ms=5000 --out=dev/audits/2026-11-01-upstream-speed.jsonl
 *
 * Arms read the same variables the gateway uses:
 *   apinex  PROVIDER_BASE_URL (optional), PROVIDER_KEY
 *   apixo   APIXO_BASE_URL (optional), APIXOAI_API_KEY or APIXO_API_KEY
 *
 * The provider-facing result is only half the story. For the gateway path,
 * point `--gateway-url` and `--gateway-key-env` at a customer key and the same
 * script measures the latency the customer actually sees.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_MODELS = [
  "gpt-6.1-sol",
  "grok-4.7",
  "deepseek-v4.1-flash",
].join(",");

const DEFAULT_PROMPT = [
  "You are reviewing a short operations note.",
  "",
  "The gateway admits a request only after it authenticates the key, checks the",
  "operator pause state, spends a rate-limit token, takes a serving-account",
  "slot, and reserves either credit, free-pool tokens or a subscription",
  "allowance. Settlement happens after the final token, in one transaction.",
  "A stream that closes without a completion marker is recorded as an error,",
  "not as a successful completion.",
  "",
  "Write a 120-word explanation of why the order of those steps matters when",
  "two customers race for the last free-pool slot. Use plain prose, no lists.",
].join("\n");

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) continue;

    const body = arg.slice(2);
    const equals = body.indexOf("=");

    if (equals >= 0) {
      values.set(body.slice(0, equals), body.slice(equals + 1));
      continue;
    }

    const next = argv[index + 1];

    if (next !== undefined && !next.startsWith("--")) {
      values.set(body, next);
      index += 1;
    } else {
      flags.add(body);
    }
  }

  return { flags, values };
}

function integer(value, fallback, minimum) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function percentiles(values, digits = 0) {
  if (values.length === 0) return { count: 0, mean: null, p50: null, p95: null };

  const sorted = [...values].sort((a, b) => a - b);
  const round = (value) => Number(value.toFixed(digits));
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

  return {
    count: sorted.length,
    mean: round(
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    ),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
  };
}

function readArms(env) {
  return [
    {
      name: "apinex",
      label: "Apinex",
      baseUrl: (env.PROVIDER_BASE_URL?.trim() || "https://api.apinex.bond/v1").replace(/\/+$/, ""),
      key: env.PROVIDER_KEY,
      keyName: "PROVIDER_KEY",
    },
    {
      name: "apixo",
      label: "Apixo",
      baseUrl: (env.APIXO_BASE_URL?.trim() || "https://api.apixoai.online/v1").replace(/\/+$/, ""),
      key: env.APIXOAI_API_KEY || env.APIXO_API_KEY,
      keyName: env.APIXOAI_API_KEY ? "APIXOAI_API_KEY" : "APIXO_API_KEY",
    },
  ];
}

function rateLimitFields(headers) {
  const pick = (name) => headers.get(name) ?? undefined;

  return {
    rateLimitScope: pick("x-ratelimit-scope") ?? null,
    rateLimitLimit: pick("x-ratelimit-limit") ?? null,
    rateLimitRemaining: pick("x-ratelimit-remaining") ?? null,
    retryAfter: pick("retry-after") ?? null,
  };
}

function countContent(value) {
  if (value === undefined || value === null) return 0;

  if (typeof value === "string") return value.length;

  if (Array.isArray(value)) return value.length;

  return 0;
}

async function readSse(res, started, record) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstByte = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    const now = performance.now() - started;

    if (firstByte === null) firstByte = now;
    record.firstByteMs = Math.round(firstByte);

    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");

    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");

      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();

      if (!payload || payload === "[DONE]") continue;

      let parsed;

      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      record.events += 1;

      const delta = parsed?.choices?.[0]?.delta;
      const content =
        delta?.content ?? parsed?.choices?.[0]?.message?.content ?? null;
      const chars = countContent(content);

      if (chars > 0) {
        if (record.ttftMs === null) record.ttftMs = Math.round(now);
        record.lastContentMs = Math.round(now);
        record.outputChars += chars;
      }

      if (parsed?.usage && typeof parsed.usage === "object") {
        record.usage = parsed.usage;
      }
    }
  }
}

async function probe({ arm, model, maxTokens, timeoutMs, includeUsage }) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`probe timed out after ${timeoutMs} ms`)),
    timeoutMs,
  );
  const record = {
    at: new Date().toISOString(),
    arm: arm.name,
    model,
    status: null,
    error: null,
    ttftMs: null,
    firstByteMs: null,
    lastContentMs: null,
    totalMs: null,
    events: 0,
    outputChars: 0,
    usage: null,
    rateLimitScope: null,
    rateLimitLimit: null,
    rateLimitRemaining: null,
    retryAfter: null,
  };

  try {
    const res = await fetch(`${arm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${arm.key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: DEFAULT_PROMPT }],
        max_tokens: maxTokens,
        temperature: 0,
        stream: true,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    });

    record.status = res.status;
    Object.assign(record, rateLimitFields(res.headers));

    if (!res.ok) {
      // Drain without storing: an error body is not evidence we need, and it
      // can carry provider-side identifiers.
      await res.text().catch(() => {});
    } else {
      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        await readSse(res, started, record);
      } else {
        const body = await res.text();

        try {
          const parsed = JSON.parse(body);
          const chars = countContent(parsed?.choices?.[0]?.message?.content);

          record.outputChars = chars;
          record.events = 1;
          record.usage = parsed?.usage ?? null;
          record.ttftMs = Math.round(performance.now() - started);
          record.lastContentMs = record.ttftMs;
        } catch {
          record.error = "non-JSON response";
        }
      }
    }
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }

  record.totalMs = Math.round(performance.now() - started);

  const completionTokens = Number(record.usage?.completion_tokens);
  const generationMs =
    record.ttftMs !== null && record.lastContentMs !== null
      ? Math.max(0, record.lastContentMs - record.ttftMs)
      : null;

  record.outputTokens = Number.isFinite(completionTokens) && completionTokens > 0
    ? completionTokens
    : null;
  record.generationMs = generationMs;
  record.tokensPerSecond =
    record.outputTokens !== null && generationMs !== null && generationMs > 0
      ? Number((record.outputTokens / (generationMs / 1000)).toFixed(2))
      : null;
  // Character-based fallback is labelled as an estimate, never as tokens.
  record.estimatedTokensPerSecond =
    record.tokensPerSecond === null &&
    record.outputChars > 0 &&
    generationMs !== null &&
    generationMs > 0
      ? Number(((record.outputChars / 4) / (generationMs / 1000)).toFixed(2))
      : null;

  return record;
}

function summarize(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const key = `${row.arm}\u0000${row.model}`;
    const bucket = buckets.get(key) ?? {
      arm: row.arm,
      model: row.model,
      requests: 0,
      ok: 0,
      refused429: 0,
      failed: 0,
      ttft: [],
      throughput: [],
      estimatedThroughput: [],
    };

    bucket.requests += 1;

    if (row.status === 200 && row.error === null) bucket.ok += 1;
    else if (row.status === 429) bucket.refused429 += 1;
    else bucket.failed += 1;

    if (row.status === 200 && row.error === null && row.ttftMs !== null) {
      bucket.ttft.push(row.ttftMs);
    }

    if (row.tokensPerSecond !== null) bucket.throughput.push(row.tokensPerSecond);
    if (row.estimatedTokensPerSecond !== null) {
      bucket.estimatedThroughput.push(row.estimatedTokensPerSecond);
    }

    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((bucket) => ({
    arm: bucket.arm,
    model: bucket.model,
    requests: bucket.requests,
    ok: bucket.ok,
    refused429: bucket.refused429,
    failed: bucket.failed,
    ttftMs: percentiles(bucket.ttft),
    tokensPerSecond: percentiles(bucket.throughput, 2),
    estimatedTokensPerSecond: percentiles(bucket.estimatedThroughput, 2),
  }));
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const execute = flags.has("execute");
  const includeUsage = flags.has("include-usage");
  const models = (values.get("models") ?? DEFAULT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const samples = integer(values.get("samples"), 2, 1);
  const intervalMs = integer(values.get("interval-ms"), 5000, 0);
  const maxTokens = integer(values.get("max-tokens"), 96, 1);
  const timeoutMs = integer(values.get("timeout-ms"), 90000, 1000);
  const maxRequests = integer(values.get("max-requests"), 40, 1);
  const armFilter = values.get("arm") ?? "all";
  const gatewayUrl = values.get("gateway-url");
  const gatewayKeyEnv = values.get("gateway-key-env") ?? "GATEWAY_KEY";

  const arms = readArms(process.env).filter(
    (arm) => armFilter === "all" || arm.name === armFilter,
  );

  if (arms.length === 0) {
    console.error(`Unknown --arm=${armFilter}. Use apinex, apixo or all.`);
    process.exitCode = 2;
    return;
  }

  if (gatewayUrl) {
    arms.push({
      name: "gateway",
      label: "Gateway",
      baseUrl: gatewayUrl.replace(/\/+$/, ""),
      key: process.env[gatewayKeyEnv],
      keyName: gatewayKeyEnv,
    });
  }

  const configured = arms.filter((arm) => Boolean(arm.key));
  const missing = arms.filter((arm) => !arm.key);
  const planned = configured.length * models.length * samples;

  const plan = {
    mode: execute ? "execute" : "dry-run",
    plannedRequests: planned,
    maxRequests,
    samples,
    models,
    intervalMs,
    maxTokens,
    timeoutMs,
    arms: configured.map((arm) => ({
      name: arm.name,
      baseUrl: arm.baseUrl,
      credential: arm.keyName,
      configured: true,
    })),
    missingCredentials: missing.map((arm) => ({
      name: arm.name,
      credential: arm.keyName,
    })),
    includeUsage,
  };

  if (planned === 0) {
    console.error(JSON.stringify({ ...plan, error: "no configured arm" }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (planned > maxRequests) {
    console.error(
      JSON.stringify(
        { ...plan, error: `plan exceeds --max-requests=${maxRequests}` },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    console.log("Dry run: no request was sent. Add --execute to spend.");
    return;
  }

  const rows = [];

  for (let sample = 1; sample <= samples; sample += 1) {
    for (const model of models) {
      for (const arm of configured) {
        const row = await probe({
          arm,
          model,
          maxTokens,
          timeoutMs,
          includeUsage,
        });

        rows.push(row);

        console.error(
          `${row.at} ${arm.name} ${model} status=${row.status ?? "none"} ` +
            `ttft=${row.ttftMs ?? "-"}ms total=${row.totalMs}ms ` +
            `tok/s=${row.tokensPerSecond ?? "-"}`,
        );

        if (intervalMs > 0) {
          await new Promise((done) => setTimeout(done, intervalMs));
        }
      }
    }
  }

  const summary = {
    ...plan,
    completedAt: new Date().toISOString(),
    results: summarize(rows),
  };

  const out = values.get("out");

  if (out) {
    const path = resolve(out);

    await mkdir(dirname(path), { recursive: true });
    await appendFile(
      path,
      rows.map((row) => `${JSON.stringify(row)}\n`).join(""),
      "utf8",
    );

    summary.out = path;
  }

  console.log(JSON.stringify(summary, null, 2));

  if (rows.every((row) => row.status !== 200 || row.error !== null)) {
    process.exitCode = 1;
  }
}

await main();
