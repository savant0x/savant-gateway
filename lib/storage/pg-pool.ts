import type { PgPool, PgQueryable } from "./pg-adapter";

import { Pool } from "pg";

/**
 * Connection configuration for the Postgres port (FID-2026-1031-085, D-8).
 *
 * Session timeouts are set on the connection rather than in application code:
 * a statement that outlives its budget and a transaction left open by a crashed
 * request are both server-side conditions, so the server has to hold the limit.
 *
 * They are applied with `SET` after the connection opens, not through libpq's
 * startup `options` (FID-2026-1102-109). Neon's pooled endpoint forwards the
 * startup packet to PgBouncer, which rejects `options` with SQLSTATE `08P01`.
 * pg-pool waits for an async `onConnect` before it hands the client to a caller,
 * so a request cannot race the two settings.
 *
 * `buildPoolOptions` is pure and exported so the settings are testable without
 * opening a socket; nothing in this module connects at import time.
 */

export type PostgresPoolSettings = {
  connectionString: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
  applicationName?: string;
};

export type PostgresPoolConfig = {
  connectionString: string;
  max: number;
  application_name: string;
  onConnect: (client: PgQueryable) => Promise<void>;
};

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;
const DEFAULT_APPLICATION_NAME = "savant-gateway";

export function buildPoolOptions(
  settings: PostgresPoolSettings,
): PostgresPoolConfig {
  const statementTimeoutMs =
    settings.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const idleInTransactionTimeoutMs =
    settings.idleInTransactionTimeoutMs ??
    DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS;

  return {
    connectionString: settings.connectionString,
    max: settings.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
    application_name: settings.applicationName ?? DEFAULT_APPLICATION_NAME,
    async onConnect(client) {
      await client.query(
        `SET statement_timeout = ${statementTimeoutMs}; ` +
          `SET idle_in_transaction_session_timeout = ${idleInTransactionTimeoutMs}`,
      );
    },
  };
}

export function createPostgresPool(settings: PostgresPoolSettings): PgPool {
  return new Pool(buildPoolOptions(settings)) as PgPool;
}
