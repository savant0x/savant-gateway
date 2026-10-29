import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ADMIN_COOKIE = "sg_admin";
export const ADMIN_TTL_SECONDS = 8 * 60 * 60;

const MIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = "v1";
const MAX_TOKEN_LENGTH = 256;
const CLOCK_SKEW_SECONDS = 300;

export type AdminConfig =
  | { configured: true; password: string; secret: string; reason: null }
  | { configured: false; password: ""; secret: ""; reason: string };

type Env = Readonly<Record<string, string | undefined>>;

export function readAdminConfig(env: Env = process.env): AdminConfig {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";

  if (!password && !secret) {
    return {
      configured: false,
      password: "",
      secret: "",
      reason:
        "Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in .env.local to enable the admin panel.",
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      configured: false,
      password: "",
      secret: "",
      reason: `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      configured: false,
      password: "",
      secret: "",
      reason: `ADMIN_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`,
    };
  }

  return { configured: true, password, secret, reason: null };
}

function deriveKey(password: string, secret: string) {
  return createHash("sha256")
    .update(`savant-gateway:admin-session:v1\u0000${secret}\u0000${password}`)
    .digest();
}

function sign(payload: string, password: string, secret: string) {
  return createHmac("sha256", deriveKey(password, secret))
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(
  config: AdminConfig,
  epoch: number,
  nowMs = Date.now(),
): string {
  if (!config.configured) {
    throw new Error("Admin session cannot be created while unconfigured.");
  }

  const expiresAt = Math.floor(nowMs / 1000) + ADMIN_TTL_SECONDS;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${TOKEN_VERSION}.${expiresAt}.${epoch}.${nonce}`;

  return `${payload}.${sign(payload, config.password, config.secret)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  config: AdminConfig,
  epoch: number,
  nowMs = Date.now(),
): boolean {
  if (!config.configured || !token) return false;
  if (token.length > MAX_TOKEN_LENGTH) return false;

  const parts = token.split(".");

  if (parts.length !== 5) return false;

  const [version, expiresAtRaw, epochRaw, nonce, signature] = parts;

  if (version !== TOKEN_VERSION) return false;
  if (!/^\d{10,12}$/.test(expiresAtRaw)) return false;
  if (!/^\d{1,9}$/.test(epochRaw) || Number(epochRaw) !== epoch) return false;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(nonce)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;

  const expiresAt = Number(expiresAtRaw);
  const nowSeconds = Math.floor(nowMs / 1000);

  if (expiresAt <= nowSeconds) return false;
  if (expiresAt > nowSeconds + ADMIN_TTL_SECONDS + CLOCK_SKEW_SECONDS) {
    return false;
  }

  const expected = sign(
    `${version}.${expiresAtRaw}.${epochRaw}.${nonce}`,
    config.password,
    config.secret,
  );
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  if (provided.length !== wanted.length) return false;

  return timingSafeEqual(provided, wanted);
}

export function verifyAdminPassword(input: unknown, expected: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  if (input.length > 512 || expected.length === 0) return false;

  const provided = createHash("sha256").update(input).digest();
  const wanted = createHash("sha256").update(expected).digest();

  return timingSafeEqual(provided, wanted);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: ADMIN_TTL_SECONDS,
  };
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (origin === null) return true;
  if (origin === "null") return false;

  const host = request.headers.get("host")?.trim().toLowerCase();

  if (!host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
