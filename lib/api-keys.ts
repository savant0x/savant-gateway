import "server-only";

/**
 * The server boundary for API key generation.
 *
 * The implementation lives in `lib/api-key-crypto.ts`, which has no
 * `server-only` import so the ported storage layer can load it under the Node
 * test runner. This module keeps the boundary where it was and re-exports the
 * one implementation rather than holding a copy.
 */
export * from "./api-key-crypto";
