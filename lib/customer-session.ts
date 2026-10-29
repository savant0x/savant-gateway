import { createHash, randomBytes } from "node:crypto";

export const CUSTOMER_COOKIE = "sg_session";
export const CUSTOMER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** A 32-byte base64url token is always 43 URL-safe characters. */
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: CUSTOMER_SESSION_TTL_SECONDS,
  };
}
