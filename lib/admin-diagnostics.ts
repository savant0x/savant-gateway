import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_SECRET_MIN_LENGTH,
  readAdminConfig,
} from "./admin-session.ts";
import { validateProductionConfig } from "./production-config.ts";

/**
 * Safe admin configuration diagnostics (FID-2026-1103-133).
 *
 * The login screen can say whether the password, session secret, origin and
 * production mode are usable, but it must never render or serialize a secret.
 * Lengths are reported as bands, and the origin is normalized to an origin so
 * credentials, paths and query strings cannot leak through it.
 */

export type AdminCredentialBand = "missing" | "too_short" | "valid";

export type AdminDiagnostics = {
  runtime: string;
  configured: boolean;
  reason: string | null;
  password: AdminCredentialBand;
  sessionSecret: AdminCredentialBand;
  passwordWhitespace: boolean;
  sessionSecretWhitespace: boolean;
  /** `null` means the caller did not probe the database. */
  databaseReachable: boolean | null;
  origin: string | null;
  originValid: boolean;
  productionConfigValid: boolean | null;
  issueCodes: string[];
};

type DiagnosticsState = { databaseReachable?: boolean | null };

type Env = Readonly<Record<string, string | undefined>>;

function band(value: string, minimum: number): AdminCredentialBand {
  if (value.length === 0) return "missing";

  return value.length < minimum ? "too_short" : "valid";
}

/**
 * A value copied from a dashboard can carry a newline or a wrapping quote. It
 * is still a valid length, but the typed password can never match it. Report
 * the condition; never trim it into a silent second credential.
 */
function hasSurroundingWhitespace(value: string) {
  return value.length > 0 && value.trim() !== value;
}

function safeOrigin(raw: string | undefined) {
  const value = raw?.trim() ?? "";

  if (!value) return { origin: null, valid: false };

  try {
    const url = new URL(value);

    return {
      origin: url.origin,
      valid:
        url.protocol === "https:" &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password,
    };
  } catch {
    return { origin: null, valid: false };
  }
}

export function readAdminDiagnostics(
  env: Env = process.env,
  state: DiagnosticsState = {},
): AdminDiagnostics {
  const config = readAdminConfig(env);
  const origin = safeOrigin(env.NEXT_PUBLIC_SITE_URL);
  const production = env.NODE_ENV === "production";
  const productionConfig = validateProductionConfig(env);
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";

  return {
    runtime: env.NODE_ENV?.trim() || "unknown",
    configured: config.configured,
    reason: config.configured ? null : config.reason,
    password: band(password, ADMIN_PASSWORD_MIN_LENGTH),
    sessionSecret: band(secret, ADMIN_SECRET_MIN_LENGTH),
    passwordWhitespace: hasSurroundingWhitespace(password),
    sessionSecretWhitespace: hasSurroundingWhitespace(secret),
    databaseReachable: state.databaseReachable ?? null,
    origin: origin.origin,
    originValid: origin.valid,
    productionConfigValid: production ? productionConfig.ok : null,
    issueCodes: production
      ? productionConfig.issues.map((issue) => issue.code)
      : [],
  };
}
