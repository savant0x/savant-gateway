import { createHmac } from "node:crypto";

import { redactSecrets } from "./redaction.ts";

/**
 * One operator-configured webhook is the alert transport. No vendor SDK and no
 * destination ship in the tree: without `OPERATIONS_ALERT_WEBHOOK_URL` the
 * monitor records incidents as `unconfigured` and sends nothing. The URL is
 * itself potentially a credential (many webhook products embed a token in the
 * path), so it is removed from every stored error before redaction.
 */

export type AlertTransportConfig =
  | {
      configured: true;
      url: string;
      secret: string | null;
      timeoutMs: number;
    }
  | { configured: false; problem: string };

export type AlertPayload = {
  id: string;
  fingerprint: string;
  event: "alert" | "recovery";
  severity: "warning" | "critical";
  status: "open" | "resolved";
  title: string;
  detail: string;
  firstSeen: string;
  lastSeen: string;
  deliveryAttempt: number;
  at: string;
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function readTimeout(env: Readonly<Record<string, string | undefined>>) {
  const value = Number(env.OPERATIONS_ALERT_TIMEOUT_MS);

  return Number.isInteger(value) && value >= 500 && value <= 15_000
    ? value
    : 5000;
}

export function readAlertTransportConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AlertTransportConfig {
  const raw = env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();

  if (!raw) {
    return {
      configured: false,
      problem:
        "OPERATIONS_ALERT_WEBHOOK_URL is not configured; incidents are stored locally.",
    };
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return {
      configured: false,
      problem: "OPERATIONS_ALERT_WEBHOOK_URL is not a valid URL.",
    };
  }

  if (url.username || url.password) {
    return {
      configured: false,
      problem: "The alert webhook URL must not contain credentials.",
    };
  }

  const insecureLoopback =
    url.protocol === "http:" &&
    LOOPBACK.has(url.hostname.toLowerCase()) &&
    (env.NODE_ENV !== "production" || env.GATEWAY_DISPOSABLE_START === "yes");

  if (url.protocol !== "https:" && !insecureLoopback) {
    return {
      configured: false,
      problem:
        "The alert webhook must use https; loopback http is allowed only in a disposable runtime.",
    };
  }

  const secret = env.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim() || null;

  if (secret !== null && secret.length < 16) {
    return {
      configured: false,
      problem:
        "OPERATIONS_ALERT_WEBHOOK_SECRET must be at least 16 characters when set.",
    };
  }

  return {
    configured: true,
    url: url.toString(),
    secret,
    timeoutMs: readTimeout(env),
  };
}

export function signAlertBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function safeError(
  value: unknown,
  url: string,
  env: Readonly<Record<string, string | undefined>>,
) {
  const text = value instanceof Error ? value.message : String(value);

  return redactSecrets(text.split(url).join("[webhook]"), env).slice(0, 500);
}

/** One HTTP attempt. Retries and bounded backoff belong to the incident row. */
export async function deliverAlert(
  payload: AlertPayload,
  config: AlertTransportConfig,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<
  { ok: true } | { ok: false; unconfigured?: boolean; error: string }
> {
  if (!config.configured) {
    return { ok: false, unconfigured: true, error: config.problem };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "savant-gateway-operations/1",
    "x-savant-event": "operations.incident",
    "x-savant-delivery": `${payload.id}:${payload.event}:${payload.deliveryAttempt}`,
  };

  if (config.secret) {
    headers["x-savant-signature"] =
      `sha256=${signAlertBody(config.secret, body)}`;
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text().catch(() => "");

    if (response.ok) return { ok: true };

    return {
      ok: false,
      error: `Webhook returned HTTP ${response.status}: ${safeError(
        text.slice(0, 300),
        config.url,
        env,
      )}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Webhook delivery failed: ${safeError(error, config.url, env)}`,
    };
  }
}
