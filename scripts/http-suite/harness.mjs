import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const LOG_LIMIT = 40_000;

let passed = 0;

export function check(label, condition, detail = "") {
  if (!condition) {
    throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  }

  passed += 1;
  console.log(`http-suite: ${label} PASS`);
}

export function checkEqual(label, actual, expected) {
  check(
    label,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

export function summary() {
  return passed;
}

export async function createTempWorkspace() {
  const directory = await mkdtemp(join(tmpdir(), "gateway-http-"));

  return {
    directory,
    dbPath: join(directory, "gateway.db"),
    async remove() {
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    },
  };
}

export function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();

    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : undefined;

      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Could not reserve a port."));
        else resolve(port);
      });
    });
  });
}

export async function startMockUpstream({ expectedKey }) {
  const state = { calls: 0, lastRequest: null };
  const server = createHttpServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));

      return;
    }

    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      state.calls += 1;

      let body = null;

      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }

      const authorization = request.headers.authorization ?? "";

      state.lastRequest = { authorization, body };

      if (authorization !== `Bearer ${expectedKey}`) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ error: { message: "unexpected provider key" } }),
        );

        return;
      }

      if (body?.stream === true) {
        const cancelling = body.messages?.[0]?.content === "cancel probe";
        response.writeHead(200, { "content-type": "text/event-stream" });
        const event = Buffer.from(`data: ${JSON.stringify({
          choices: [{ delta: { content: "http-suite-stream 💠" } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        })}\r\n\r\n`);
        const split = event.indexOf(Buffer.from("💠")) + 1;

        response.write(event.subarray(0, split));
        setTimeout(() => response.write(event.subarray(split)), 5);
        setTimeout(() => response.write("data: [DO"), cancelling ? 1_000 : 15);
        setTimeout(() => response.end("NE]\r\n\r\n"), cancelling ? 1_020 : 20);

        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "chatcmpl-http-suite",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body?.model ?? "mock-upstream-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "http-suite-ok" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      );
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    reset() {
      state.calls = 0;
      state.lastRequest = null;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

export function startNextServer({ repo, port, dbPath, env }) {
  const logs = { out: "", err: "" };
  const nextBin = join(repo, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: repo,
      env: { ...process.env, NODE_ENV: "production", DB_PATH: dbPath, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    logs.out = `${logs.out}${chunk}`.slice(-LOG_LIMIT);
  });
  child.stderr.on("data", (chunk) => {
    logs.err = `${logs.err}${chunk}`.slice(-LOG_LIMIT);
  });

  return { child, logs };
}

export function logTail(logs, lines = 60) {
  const text = [logs.err, logs.out].filter(Boolean).join("\n").trim();

  if (!text) return "(no server output)";

  return text.split(/\r?\n/).slice(-lines).join("\n");
}

export async function waitForServer({ baseUrl, child, logs }) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited with code ${child.exitCode}\n${logTail(logs)}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        redirect: "manual",
      });

      if (response.status > 0) return;
    } catch {
      // The server is still binding its port.
    }

    await sleep(250);
  }

  throw new Error(`server did not answer within 60s\n${logTail(logs)}`);
}

export async function waitForSchema(dbPath) {
  const deadline = Date.now() + 60_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (!existsSync(dbPath)) {
      await sleep(250);
      continue;
    }

    try {
      const database = new Database(dbPath);

      database.pragma("busy_timeout = 5000");

      const rows = database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('topups', 'providers', 'models', 'model_groups')`,
        )
        .all();

      if (rows.length === 4) return database;

      database.close();
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `schema not ready: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}

export async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const origin = options.origin === undefined ? baseUrl : options.origin;

  if (origin) headers.origin = origin;
  if (options.cookie) headers.cookie = options.cookie;

  let body;

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  } else if (options.rawBody !== undefined) {
    headers["content-type"] = options.contentType ?? "application/json";
    body = options.rawBody;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    redirect: options.redirect ?? "manual",
  });
  const text = await response.text();

  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, headers: response.headers, text, json };
}

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const raw = response.headers.get("set-cookie");

  return raw ? [raw] : [];
}

export function cookieValue(response, name) {
  for (const entry of setCookies(response)) {
    const [pair] = entry.split(";");
    const index = pair.indexOf("=");

    if (index > 0 && pair.slice(0, index).trim() === name) {
      return pair.slice(index + 1).trim();
    }
  }

  return null;
}

export function cookieFlags(response, name) {
  const entry = setCookies(response).find((value) =>
    value.trim().toLowerCase().startsWith(`${name.toLowerCase()}=`),
  );

  return entry ? entry.toLowerCase() : "";
}

export function assertCookie(response, name, expected = {}) {
  const raw = cookieFlags(response, name);

  check(`${name} cookie is set`, raw.length > 0, "(missing Set-Cookie)");

  if (!raw) return;

  if (expected.httpOnly) {
    check(`${name} is HttpOnly`, /(^|;\s*)httponly(;|$)/.test(raw), raw);
  }

  if (expected.sameSite) {
    check(
      `${name} is SameSite=${expected.sameSite}`,
      raw.includes(`samesite=${expected.sameSite.toLowerCase()}`),
      raw,
    );
  }

  if (expected.maxAge !== undefined) {
    check(
      `${name} has Max-Age=${expected.maxAge}`,
      raw.includes(`max-age=${expected.maxAge}`),
      raw,
    );
  }

  if (expected.secure) {
    check(`${name} is Secure`, /(^|;\s*)secure(;|$)/.test(raw), raw);
  }

  if (expected.path) {
    check(`${name} has Path=${expected.path}`, raw.includes(`path=${expected.path}`), raw);
  }
}

export function signWebhook(payload, secret, timestamp) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }

    child.once("exit", onExit);
  });
}

export async function stopNextServer(child) {
  if (!child || child.exitCode !== null) return;

  child.kill("SIGTERM");

  if (await waitForExit(child, 5_000)) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGKILL");
  }

  await waitForExit(child, 3_000);
}
