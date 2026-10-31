import { isIP } from "node:net";

import { createRateLimiter } from "./admin-rate-limit.ts";

/** Per-process fixed-window limits. SQLite deployments run one app process. */
export const signupLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000,
});

export const loginLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60 * 1000,
});

/**
 * Per-account login ceiling. The address key above comes from a forwarded
 * header that a direct client can rotate, so it is a best-effort bound. This
 * one is keyed by the account being guessed and does not depend on any header.
 */
export const loginAccountLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60 * 1000,
});

export const topupLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
});

export const subscriptionLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
});

/** Support requests are durable operator work, so bound how many one account
 * can queue per hour. */
export const supportLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000,
});

export function clientKey(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const header = env.GATEWAY_TRUSTED_IP_HEADER?.trim().toLowerCase();

  if (!header || !["fly-client-ip", "x-real-ip"].includes(header))
    return "untrusted-client";

  const value = request.headers.get(header)?.trim();

  return value && isIP(value) ? value : "untrusted-client";
}
