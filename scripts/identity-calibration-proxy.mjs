#!/usr/bin/env node
/**
 * Loopback calibration adversary (FID-2026-1110-002, step 4).
 *
 * Forwards every request to one configured real upstream and applies exactly
 * one declared arm transform. It binds 127.0.0.1 only, refuses a non-loopback
 * Host, keeps the provider credential in memory, never logs it, never follows a
 * redirect and never caches. It does not fabricate model output.
 *
 * Usage:
 *   node scripts/identity-calibration-proxy.mjs \
 *     --arm hidden_prompt --upstream https://api.example.test/v1 \
 *     --key-env PROVIDER_KEY --port 4010
 */

import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

import {
  applyArmTransform,
  armById,
  buildArmSet,
} from "../lib/identity/calibration/arms.ts";
import {
  admitProxyRequest,
  MAX_PROXY_BODY_BYTES,
  PROXY_TIMEOUT_MS,
  sanitizeForwardHeaders,
  upstreamUrl,
} from "../lib/identity/calibration/proxy.ts";

export const PROXY_BIND = "127.0.0.1";

function parseArgs(argv) {
  const args = { port: 4010, keyHeader: "authorization" };

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near ${key ?? "end of input"}.`);
    }

    args[key.slice(2)] = value;
  }

  for (const required of ["arm", "upstream", "key-env"]) {
    if (!args[required]) {
      throw new Error(`Missing --${required}.`);
    }
  }

  return args;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_PROXY_BODY_BYTES) {
        reject(new Error("request body exceeds the proxy cap"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function upstreamHeaders(headers, keyHeader, credential) {
  const forwarded = sanitizeForwardHeaders(headers);

  forwarded["content-type"] = forwarded["content-type"] ?? "application/json";

  if (keyHeader.toLowerCase() === "x-api-key") {
    forwarded["x-api-key"] = credential;
  } else {
    forwarded.authorization = `Bearer ${credential}`;
  }

  return forwarded;
}

function responseHeaders(headers) {
  const kept = {};

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();

    if (lower === "set-cookie" || lower === "authorization") continue;
    if (value === undefined) continue;

    kept[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  return kept;
}

function forward(options, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: options.headers,
        timeout: PROXY_TIMEOUT_MS,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 502,
            headers: responseHeaders(response.headers),
            body: Buffer.concat(chunks),
          }),
        );
      },
    );

    request.on("timeout", () => request.destroy(new Error("upstream timeout")));
    request.on("error", reject);

    if (payload) request.write(payload);

    request.end();
  });
}

/**
 * Builds the server without binding it, so a test can start it on port 0 and a
 * CLI run can decide the port. `receipts` collects one entry per forwarded
 * request; nothing sensitive is recorded.
 */
export function createCalibrationProxy(options) {
  if (!options.credential) {
    throw new Error("The calibration proxy needs a provider credential.");
  }

  const arms =
    options.substitutionModelId && options.versionSwapModelId
      ? buildArmSet({
          substitutionModelId: options.substitutionModelId,
          versionSwapModelId: options.versionSwapModelId,
        })
      : undefined;
  const definition = arms
    ? armById(arms, options.arm)
    : // The three wire-level arms need no routing ids.
      buildArmSet({
        substitutionModelId: "unused-substitution",
        versionSwapModelId: "unused-version-swap",
      }).find((entry) => entry.id === options.arm);

  if (!definition) {
    throw new Error(`Unknown arm: ${options.arm}.`);
  }

  if (
    definition.transform.kind === "route_model" &&
    !options.substitutionModelId
  ) {
    throw new Error(`Arm ${options.arm} needs --substitution-model.`);
  }

  const receipts = [];

  const server = http.createServer(async (request, response) => {
    const admission = admitProxyRequest({
      host: request.headers.host,
      url: request.url,
      method: request.method,
    });

    if (!admission.ok) {
      response.writeHead(admission.status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ error: admission.reason }));
      return;
    }

    let payload = null;

    if (request.method === "POST") {
      const raw = await readBody(request);
      payload = raw === "" ? null : JSON.parse(raw);
    }

    let forwardedBody = null;
    let receipt = null;

    if (payload !== null) {
      const result = applyArmTransform(definition, payload);

      forwardedBody = JSON.stringify(result.request);
      receipt = result.receipt;
    }

    try {
      const upstream = await forward(
        {
          url: upstreamUrl(options.upstream, request.url ?? "/"),
          method: request.method ?? "POST",
          headers: upstreamHeaders(
            request.headers,
            options.keyHeader ?? "authorization",
            options.credential,
          ),
        },
        forwardedBody,
      );

      response.writeHead(upstream.status, {
        ...upstream.headers,
        "cache-control": "no-store",
      });
      response.end(upstream.body);

      if (receipt) {
        receipts.push({ ...receipt, status: upstream.status });
        process.stderr.write(`${JSON.stringify(receipt)}\n`);
      }
    } catch (error) {
      response.writeHead(502, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "upstream failed",
        }),
      );
    }
  });

  return { server, receipts, definition };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credential = process.env[args["key-env"]];

  if (!credential) {
    throw new Error(`${args["key-env"]} is not set in this process.`);
  }

  const { server, definition } = createCalibrationProxy({
    arm: args.arm,
    upstream: args.upstream,
    credential,
    keyHeader: args["key-header"],
    substitutionModelId: args["substitution-model"],
    versionSwapModelId: args["version-swap-model"],
  });
  const port = Number(args.port);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid --port: ${args.port}.`);
  }

  await new Promise((resolve) => server.listen(port, PROXY_BIND, resolve));

  const address = server.address();

  process.stdout.write(
    `${JSON.stringify({
      listening: `http://${PROXY_BIND}:${address.port}`,
      arm: definition.id,
      transform: definition.transform.kind,
      transformSha256: definition.transformSha256,
    })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(
      `identity-calibration-proxy: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
