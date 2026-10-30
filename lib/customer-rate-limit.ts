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

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();

  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}
