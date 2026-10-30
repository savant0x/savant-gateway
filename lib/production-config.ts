import { tmpdir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";

import { readAdminConfig } from "./admin-session.ts";

/**
 * Production configuration is part of the accounting contract, not just a
 * deployment detail. A localhost origin breaks redirects and secure cookies; a
 * temporary SQLite file loses balances; more than one process multiplies the
 * process-local admission buckets. Validate those facts before serving, and
 * report codes rather than values so a diagnostic cannot leak a secret.
 */

export type ProductionIssueCode =
  | "origin_missing"
  | "origin_insecure"
  | "origin_loopback"
  | "origin_invalid"
  | "db_missing"
  | "db_memory"
  | "db_relative"
  | "db_ephemeral"
  | "admin_unconfigured"
  | "multi_worker"
  | "manual_signal_handler";

export type ProductionIssue = {
  code: ProductionIssueCode;
  message: string;
};

export type ProductionConfig = {
  ok: boolean;
  /** Normalised public origin, or null when absent or unusable. */
  origin: string | null;
  /** Absolute SQLite file, or null when absent or unusable. */
  databasePath: string | null;
  issues: ProductionIssue[];
  /**
   * True only when the operator explicitly opted into a disposable runtime
   * (GATEWAY_DISPOSABLE_START=yes). The mechanical HTTP verification gates run
   * production servers against throwaway storage on loopback; an operator must
   * spell out that intent in the environment rather than have the validator
   * guess, and the name makes a real deployment carrying it visible.
   */
  disposable: boolean;
};

export type ReadinessReport = {
  status: "ready" | "not_ready";
  httpStatus: 200 | 503;
  checks: {
    configuration: "ok" | "invalid" | "disposable";
    storage: "ok" | "unavailable";
  };
};

type Env = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const TRUTHY = new Set(["1", "true", "yes", "on"]);
const DISPOSABLE_ENV = "GATEWAY_DISPOSABLE_START";
const DISPOSABLE_VALUE = "yes";

/** Read the single deliberate opt-in; anything else is not a permission. */
function readDisposable(env: Env) {
  return env[DISPOSABLE_ENV] === DISPOSABLE_VALUE;
}

function issue(code: ProductionIssueCode, message: string): ProductionIssue {
  return { code, message };
}

function readOrigin(raw: string | undefined, issues: ProductionIssue[]): string | null {
  const value = raw?.trim() ?? "";

  if (!value) {
    issues.push(
      issue("origin_missing", "NEXT_PUBLIC_SITE_URL is required in production."),
    );

    return null;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    issues.push(
      issue("origin_invalid", "NEXT_PUBLIC_SITE_URL must be a valid URL origin."),
    );

    return null;
  }

  if (url.protocol !== "https:") {
    issues.push(issue("origin_insecure", "NEXT_PUBLIC_SITE_URL must use https."));
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) {
    issues.push(
      issue(
        "origin_loopback",
        "NEXT_PUBLIC_SITE_URL must not be a loopback or wildcard host.",
      ),
    );
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    issues.push(
      issue(
        "origin_invalid",
        "NEXT_PUBLIC_SITE_URL must be an origin with no credentials, path, query or fragment.",
      ),
    );
  }

  return url.origin;
}

function readDatabasePath(
  raw: string | undefined,
  issues: ProductionIssue[],
  options: { allowEphemeral: boolean },
): string | null {
  const value = raw?.trim() ?? "";

  if (!value) {
    issues.push(issue("db_missing", "DB_PATH is required in production."));

    return null;
  }

  if (value === ":memory:") {
    issues.push(
      issue("db_memory", "DB_PATH must be a file, not an in-memory database."),
    );

    return null;
  }

  if (!isAbsolute(value)) {
    issues.push(
      issue(
        "db_relative",
        "DB_PATH must be absolute so it survives a working-directory change.",
      ),
    );

    return null;
  }

  const resolved = resolve(value);

  if (options.allowEphemeral) return resolved;

  const temporary = resolve(tmpdir());
  const compare = (path: string) =>
    process.platform === "win32" ? path.toLowerCase() : path;
  const target = compare(resolved);
  const tempRoot = compare(temporary);

  if (target === tempRoot || target.startsWith(`${tempRoot}${sep}`)) {
    issues.push(
      issue(
        "db_ephemeral",
        "DB_PATH must not be under the system temporary directory.",
      ),
    );
  }

  return resolved;
}

function readWorkerIssue(env: Env, issues: ProductionIssue[]) {
  for (const name of ["WEB_CONCURRENCY", "PM2_INSTANCES"] as const) {
    const value = Number(env[name]);

    if (Number.isFinite(value) && value > 1) {
      issues.push(
        issue(
          "multi_worker",
          "This topology supports one application process; WEB_CONCURRENCY and PM2_INSTANCES must not exceed 1.",
        ),
      );

      return;
    }
  }

  const instance = Number(env.NODE_APP_INSTANCE);

  if (Number.isFinite(instance) && instance > 0) {
    issues.push(
      issue(
        "multi_worker",
        "This topology supports one application process; NODE_APP_INSTANCE must be 0.",
      ),
    );
  }
}

/**
 * Non-production environments may use a localhost origin and a relative or
 * in-memory database; only a production start is held to the durable contract.
 */
export function validateProductionConfig(env: Env = process.env): ProductionConfig {
  const disposable = readDisposable(env);

  if (env.NODE_ENV !== "production") {
    return {
      ok: true,
      origin: env.NEXT_PUBLIC_SITE_URL?.trim() || null,
      databasePath: env.DB_PATH?.trim() || null,
      issues: [],
      disposable,
    };
  }

  const issues: ProductionIssue[] = [];
  // A disposable start skips only the origin and ephemeral-storage checks: the
  // mechanical environments run on loopback against throwaway files. The
  // admin/operator, process-topology and signal checks remain in force.
  const origin = disposable
    ? env.NEXT_PUBLIC_SITE_URL?.trim() || null
    : readOrigin(env.NEXT_PUBLIC_SITE_URL, issues);
  const databasePath = readDatabasePath(env.DB_PATH, issues, {
    allowEphemeral: disposable,
  });

  if (!readAdminConfig(env).configured) {
    issues.push(
      issue(
        "admin_unconfigured",
        "ADMIN_PASSWORD and ADMIN_SESSION_SECRET must be configured for the operator console.",
      ),
    );
  }

  readWorkerIssue(env, issues);

  const manualSignal = env.NEXT_MANUAL_SIG_HANDLE?.trim().toLowerCase();

  if (manualSignal && TRUTHY.has(manualSignal)) {
    issues.push(
      issue(
        "manual_signal_handler",
        "NEXT_MANUAL_SIG_HANDLE must be unset so the server drains in-flight work on SIGTERM.",
      ),
    );
  }

  return { ok: issues.length === 0, origin, databasePath, issues, disposable };
}

/** Readiness is false when either the configuration or storage is unusable. */
export function readinessReport(input: {
  configuration: ProductionConfig;
  storage: boolean;
}): ReadinessReport {
  const ready = input.configuration.ok && input.storage;
  const configuration: ReadinessReport["checks"]["configuration"] = !input
    .configuration.ok
    ? "invalid"
    : input.configuration.disposable
      ? "disposable"
      : "ok";

  return {
    status: ready ? "ready" : "not_ready",
    httpStatus: ready ? 200 : 503,
    checks: {
      configuration,
      storage: input.storage ? "ok" : "unavailable",
    },
  };
}
