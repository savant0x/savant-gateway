import { createRateLimiter } from "./admin-rate-limit";

/** Per-process fixed-window limits. SQLite deployments run one app process. */
export const signupLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000,
});

export const loginLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60 * 1000,
});

export const topupLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
});

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();

  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}
