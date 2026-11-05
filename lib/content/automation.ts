/**
 * Content automation policy (FID-2026-1104-015).
 *
 * The policy is durable database state, not a deployment guess. An absent row
 * preserves the legacy `CONTENT_INGEST_ENABLED` behaviour; a stored row is the
 * explicit operator decision. Heartbeat health is derived from the last durable
 * run, never from a saved checkbox.
 */

import type { FetchRun } from "./types.ts";

import { contentIngestEnabled } from "./policy.ts";

export const AUTOMATION_SETTINGS_KEY = "content.automation.policy";
export const AUTOMATION_POLICY_VERSION = 1;

export const AUTOMATION_LIMITS = {
  batchLimit: { min: 1, max: 50, default: 10 },
  heartbeatMinutes: { min: 1, max: 60, default: 5 },
  overdueGraceMs: 60_000,
} as const;

export type ContentAutomationPolicy = {
  version: number;
  revision: number;
  enabled: boolean;
  batchLimit: number;
  heartbeatMinutes: number;
};

export type AutomationHealthState =
  | "paused"
  | "secret_missing"
  | "awaiting_first_heartbeat"
  | "running"
  | "healthy"
  | "overdue"
  | "partial"
  | "failed";

export type AutomationHealth = {
  state: AutomationHealthState;
  label: string;
  detail: string;
};

export type ParsedPolicy =
  { ok: true; policy: ContentAutomationPolicy } | { ok: false; error: string };

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function defaultAutomationPolicy(
  env: Record<string, string | undefined> = process.env,
): ContentAutomationPolicy {
  return {
    version: AUTOMATION_POLICY_VERSION,
    revision: 0,
    enabled: contentIngestEnabled(env),
    batchLimit: AUTOMATION_LIMITS.batchLimit.default,
    heartbeatMinutes: AUTOMATION_LIMITS.heartbeatMinutes.default,
  };
}

/** Parses one durable policy value. Invalid stored JSON fails closed. */
export function parseAutomationPolicy(
  raw: string | null,
  env: Record<string, string | undefined> = process.env,
): ParsedPolicy {
  if (raw === null || raw.trim() === "") {
    return { ok: true, policy: defaultAutomationPolicy(env) };
  }

  let parsed: Record<string, unknown>;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        error: "The stored automation policy is not an object.",
      };
    }

    parsed = value;
  } catch {
    return {
      ok: false,
      error: "The stored automation policy is not valid JSON.",
    };
  }

  if (
    parsed.version !== AUTOMATION_POLICY_VERSION ||
    typeof parsed.enabled !== "boolean" ||
    typeof parsed.batchLimit !== "number" ||
    typeof parsed.heartbeatMinutes !== "number" ||
    typeof parsed.revision !== "number" ||
    !integerInRange(parsed.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !integerInRange(
      parsed.batchLimit,
      AUTOMATION_LIMITS.batchLimit.min,
      AUTOMATION_LIMITS.batchLimit.max,
    ) ||
    !integerInRange(
      parsed.heartbeatMinutes,
      AUTOMATION_LIMITS.heartbeatMinutes.min,
      AUTOMATION_LIMITS.heartbeatMinutes.max,
    )
  ) {
    return {
      ok: false,
      error: "The stored automation policy has invalid values.",
    };
  }

  return {
    ok: true,
    policy: {
      version: AUTOMATION_POLICY_VERSION,
      revision: parsed.revision,
      enabled: parsed.enabled,
      batchLimit: parsed.batchLimit,
      heartbeatMinutes: parsed.heartbeatMinutes,
    },
  };
}

/** Validates a PATCH against the current policy. Unknown keys are refused. */
export function validateAutomationPatch(
  current: ContentAutomationPolicy,
  input: Record<string, unknown>,
): ParsedPolicy {
  const allowed = new Set([
    "enabled",
    "batchLimit",
    "heartbeatMinutes",
    "expectedRevision",
  ]);

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      return { ok: false, error: `Unknown policy field: ${key}.` };
    }
  }

  if (
    typeof input.expectedRevision !== "number" ||
    !integerInRange(input.expectedRevision, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return {
      ok: false,
      error: "expectedRevision must be a non-negative integer.",
    };
  }

  if (input.expectedRevision !== current.revision) {
    return {
      ok: false,
      error:
        "The automation policy changed since it was loaded. Refresh and try again.",
    };
  }

  const enabled = input.enabled === undefined ? current.enabled : input.enabled;

  if (typeof enabled !== "boolean") {
    return { ok: false, error: "enabled must be a boolean." };
  }

  const batchLimit =
    input.batchLimit === undefined ? current.batchLimit : input.batchLimit;

  if (
    typeof batchLimit !== "number" ||
    !integerInRange(
      batchLimit,
      AUTOMATION_LIMITS.batchLimit.min,
      AUTOMATION_LIMITS.batchLimit.max,
    )
  ) {
    return {
      ok: false,
      error: `batchLimit must be an integer from ${AUTOMATION_LIMITS.batchLimit.min} to ${AUTOMATION_LIMITS.batchLimit.max}.`,
    };
  }

  const heartbeatMinutes =
    input.heartbeatMinutes === undefined
      ? current.heartbeatMinutes
      : input.heartbeatMinutes;

  if (
    typeof heartbeatMinutes !== "number" ||
    !integerInRange(
      heartbeatMinutes,
      AUTOMATION_LIMITS.heartbeatMinutes.min,
      AUTOMATION_LIMITS.heartbeatMinutes.max,
    )
  ) {
    return {
      ok: false,
      error: `heartbeatMinutes must be an integer from ${AUTOMATION_LIMITS.heartbeatMinutes.min} to ${AUTOMATION_LIMITS.heartbeatMinutes.max}.`,
    };
  }

  return {
    ok: true,
    policy: {
      version: AUTOMATION_POLICY_VERSION,
      revision: current.revision,
      enabled,
      batchLimit,
      heartbeatMinutes,
    },
  };
}

export function heartbeatWindowMs(policy: ContentAutomationPolicy): number {
  return policy.heartbeatMinutes * 60_000;
}

/**
 * A stopped scheduler must not look healthy. The overdue threshold is two
 * expected heartbeat periods plus one minute of grace, exactly as the child
 * contract specifies.
 */
export function automationHealth(
  policy: ContentAutomationPolicy,
  lastRun: FetchRun | null,
  secretConfigured: boolean,
  dueCount: number,
  now = new Date(),
): AutomationHealth {
  if (!policy.enabled) {
    return {
      state: "paused",
      label: "Paused",
      detail:
        "Automation is paused in the dashboard. A heartbeat is recorded but no new source work is admitted.",
    };
  }

  if (!secretConfigured) {
    return {
      state: "secret_missing",
      label: "Secret missing",
      detail:
        "No CRON_SECRET or CONTENT_CRON_SECRET is configured. The endpoint refuses every request.",
    };
  }

  if (!lastRun) {
    return {
      state: "awaiting_first_heartbeat",
      label: "Awaiting first heartbeat",
      detail:
        "The policy is enabled, but no authenticated heartbeat has been recorded. A saved flag does not prove a scheduler exists.",
    };
  }

  const started = new Date(lastRun.startedAt).getTime();
  const delay =
    heartbeatWindowMs(policy) * 2 + AUTOMATION_LIMITS.overdueGraceMs;
  const overdue = Number.isFinite(started) && now.getTime() > started + delay;

  if (lastRun.status === "running") {
    if (new Date(lastRun.expiresAt).getTime() > now.getTime()) {
      return {
        state: "running",
        label: "Running",
        detail: `A run is in progress with ${dueCount} source(s) still due.`,
      };
    }

    return {
      state: "overdue",
      label: "Heartbeat overdue",
      detail:
        "The last run's owner lease expired before it finished. The next tick will mark it interrupted.",
    };
  }

  if (lastRun.status === "paused") {
    return {
      state: "paused",
      label: "Paused",
      detail:
        "The heartbeat reached the endpoint while automation was paused. No source work was admitted.",
    };
  }

  if (lastRun.status === "failed" || lastRun.status === "interrupted") {
    return {
      state: "failed",
      label:
        lastRun.status === "interrupted"
          ? "Run interrupted"
          : "Last run failed",
      detail: lastRun.error ?? "Open the run history for the recorded outcome.",
    };
  }

  if (overdue) {
    return {
      state: "overdue",
      label: "Heartbeat overdue",
      detail: `No heartbeat has been recorded for more than two ${policy.heartbeatMinutes}-minute periods.`,
    };
  }

  if (lastRun.status === "partial") {
    return {
      state: "partial",
      label: "Partial",
      detail: `The last run completed with failures or paused work; ${dueCount} source(s) remain due.`,
    };
  }

  return {
    state: "healthy",
    label: "Healthy",
    detail:
      dueCount > 0
        ? `${dueCount} source(s) are due on later bounded batches.`
        : "The last heartbeat completed with no due source work remaining.",
  };
}
