import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Mirrors the signup validation bound in lib/customer.ts. Kept local so this
// module stays importable by the Node test runner without path resolution.
const MAX_PASSWORD_LENGTH = 256;
const FORMAT = "scrypt";
const VERSION = "1";
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const N = 16_384;
const R = 8;
const P = 1;

/**
 * Stores a versioned, self-describing hash:
 * `scrypt$1$16384$8$1$<salt>$<key>`.
 */
export function hashPassword(password: string) {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password is too long.");
  }

  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return [
    FORMAT,
    VERSION,
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string | null) {
  if (!password || !stored || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }

  const parts = stored.split("$");

  if (parts.length !== 7) return false;

  const [format, version, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;

  if (format !== FORMAT || version !== VERSION) return false;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (n !== N || r !== R || p !== P) return false;

  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(keyRaw, "base64url");
  } catch {
    return false;
  }

  if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return timingSafeEqual(actual, expected);
}
