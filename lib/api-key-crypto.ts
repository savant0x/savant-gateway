import { createHash, randomBytes } from "node:crypto";

/**
 * API key generation and hashing.
 *
 * Split out of `lib/api-keys.ts` for the same reason the row projections moved
 * to `lib/projections.ts`: that module imports `server-only`, which throws
 * outside a React server context, so the ported storage layer could not load its
 * own key store under the Node test runner. The guard belongs on the module the
 * application imports, not on a pure hash function that has no ambient access
 * and no database handle.
 *
 * There is one implementation. `lib/api-keys.ts` re-exports these and keeps the
 * server boundary.
 */

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey() {
  const secret = `sk-${randomBytes(32).toString("hex")}`;
  const prefix = `${secret.slice(0, 8)}…${secret.slice(-4)}`;

  return { secret, prefix, secretHash: hashApiKey(secret) };
}
