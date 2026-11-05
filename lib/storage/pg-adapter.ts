import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Async data layer for the Postgres port (FID-2026-1031-085, step 1).
 *
 * This module deliberately keeps the call shape the SQLite code already uses —
 * `prepare(sql).get/all/run`, `exec(sql)`, `transaction(fn)` — and adds `await`
 * rather than a new repository API. 323 statements already express the intended
 * operations; redesigning them would add a second correctness risk on top of
 * the port.
 *
 * No `server-only` import and no driver import here: the pool is injected, so
 * the adapter is exercisable without a database. The server boundary stays at
 * `lib/db.ts`.
 */

export type PgRow = Record<string, unknown>;

export type PgQueryResult = {
  rows: unknown[];
  rowCount: number | null;
};

export type PgQueryable = {
  query(sql: string, values?: unknown[]): Promise<PgQueryResult>;
};

export type PgLease = PgQueryable & {
  release(error?: Error): void;
};

export type PgPool = PgQueryable & {
  connect(): Promise<PgLease>;
  end?(): Promise<void>;
};

export type AsyncStatement = {
  get<T = PgRow>(...params: unknown[]): Promise<T | undefined>;
  all<T = PgRow>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
};

export type Transaction<T> = {
  (): Promise<T>;
  /**
   * Postgres has no `BEGIN IMMEDIATE`. This alias preserves the shape of the
   * SQLite calls that used it, but it takes no write lock: the exclusion now
   * comes from the statement's own row lock (FID-085 D-4). A transaction that
   * needs exclusion must select its rows `FOR UPDATE` or use a conditional
   * `UPDATE ... WHERE available >= $1 RETURNING`.
   */
  immediate(): Promise<T>;
};

export type MigrationClient = {
  exec(sql: string): Promise<void>;
};

export type PostgresDatabaseOptions = {
  pool: PgPool;
  migrate?(client: MigrationClient): Promise<void>;
};

export type PostgresDatabase = {
  prepare(sql: string): AsyncStatement;
  query<T = PgRow>(sql: string, values?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => T | Promise<T>): Transaction<T>;
  ready(): Promise<void>;
  close(): Promise<void>;
};

type Scanner = "plain" | "single" | "double" | "line" | "block" | "dollar";

type TransactionState = {
  client: PgQueryable;
  depth: number;
};

const activeTransaction = new AsyncLocalStorage<TransactionState>();

const DOLLAR_TAG = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/;

/**
 * Rewrites SQLite positional placeholders (`?`) into Postgres positional
 * parameters (`$1`, `$2`, ...). Question marks inside single-quoted literals,
 * double-quoted identifiers, dollar-quoted bodies, line comments and block
 * comments are left untouched — a blind replace would corrupt any SQL that
 * contains a literal question mark.
 */
export function renamePlaceholders(sql: string): string {
  let output = "";
  let index = 0;
  let scanner: Scanner = "plain";
  let dollarTag = "";

  for (let position = 0; position < sql.length; position += 1) {
    const char = sql[position];
    const next = sql[position + 1];

    if (scanner === "line") {
      output += char;

      if (char === "\n") scanner = "plain";

      continue;
    }

    if (scanner === "block") {
      output += char;

      if (char === "*" && next === "/") {
        output += next;
        position += 1;
        scanner = "plain";
      }

      continue;
    }

    if (scanner === "single" || scanner === "double") {
      const quote = scanner === "single" ? "'" : '"';

      output += char;

      if (char === quote && next === quote) {
        output += next;
        position += 1;

        continue;
      }

      if (char === quote) scanner = "plain";

      continue;
    }

    if (scanner === "dollar") {
      if (sql.startsWith(dollarTag, position)) {
        output += dollarTag;
        position += dollarTag.length - 1;
        scanner = "plain";

        continue;
      }

      output += char;

      continue;
    }

    if (char === "'") {
      scanner = "single";
      output += char;

      continue;
    }

    if (char === '"') {
      scanner = "double";
      output += char;

      continue;
    }

    if (char === "-" && next === "-") {
      scanner = "line";
      output += char + next;
      position += 1;

      continue;
    }

    if (char === "/" && next === "*") {
      scanner = "block";
      output += char + next;
      position += 1;

      continue;
    }

    if (char === "$") {
      const tag = DOLLAR_TAG.exec(sql.slice(position));

      if (tag) {
        dollarTag = tag[0];
        scanner = "dollar";
        output += dollarTag;
        position += dollarTag.length - 1;

        continue;
      }
    }

    if (char === "?") {
      index += 1;
      output += `$${index}`;

      continue;
    }

    output += char;
  }

  return output;
}

export function createPostgresDatabase(
  options: PostgresDatabaseOptions,
): PostgresDatabase {
  const { pool } = options;
  let initialization: Promise<void> | undefined;

  const initialize = async () => {
    await pool.query("SELECT 1");

    if (options.migrate) {
      await options.migrate({
        exec: async (sql) => {
          await pool.query(sql);
        },
      });
    }
  };

  // Lazy and single-flight: creating the handle touches no connection, the
  // first operation pays for it, and concurrent first callers share one run.
  // A rejected initialization stays cached, so a bad database fails closed
  // instead of being retried into a half-migrated schema.
  const ready = () => {
    initialization ??= initialize();

    return initialization;
  };

  const dispatch = async (
    sql: string,
    values: unknown[],
  ): Promise<PgQueryResult> => {
    await ready();

    const active = activeTransaction.getStore();

    return active ? active.client.query(sql, values) : pool.query(sql, values);
  };

  const prepare = (sql: string): AsyncStatement => {
    const text = renamePlaceholders(sql);

    return {
      async get<T = PgRow>(...params: unknown[]) {
        const result = await dispatch(text, params);

        return result.rows[0] as unknown as T | undefined;
      },
      async all<T = PgRow>(...params: unknown[]) {
        const result = await dispatch(text, params);

        return result.rows as unknown as T[];
      },
      async run(...params: unknown[]) {
        const result = await dispatch(text, params);

        return { changes: result.rowCount ?? 0 };
      },
    };
  };

  const runNested = async <T>(
    active: TransactionState,
    fn: () => T | Promise<T>,
  ): Promise<T> => {
    const depth = active.depth + 1;
    const savepoint = `gateway_sp_${depth}`;

    await active.client.query(`SAVEPOINT ${savepoint}`);

    try {
      const value = await activeTransaction.run(
        { client: active.client, depth },
        async () => fn(),
      );

      await active.client.query(`RELEASE SAVEPOINT ${savepoint}`);

      return value;
    } catch (error) {
      await active.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);

      throw error;
    }
  };

  const transaction = <T>(fn: () => T | Promise<T>): Transaction<T> => {
    const run = async (): Promise<T> => {
      await ready();

      const active = activeTransaction.getStore();

      if (active) return runNested(active, fn);

      const client = await pool.connect();
      let releaseError: Error | undefined;

      try {
        await client.query("BEGIN");

        const value = await activeTransaction.run(
          { client, depth: 0 },
          async () => fn(),
        );

        await client.query("COMMIT");

        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          // The statement that failed is the error worth reporting. A rollback
          // failure means the connection is unusable; release it with the
          // error so node-postgres destroys it instead of returning it idle.
          releaseError =
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError));
        }

        throw error;
      } finally {
        client.release(releaseError);
      }
    };

    return Object.assign(() => run(), { immediate: () => run() });
  };

  return {
    prepare,
    async query<T = PgRow>(sql: string, values: unknown[] = []) {
      const result = await dispatch(renamePlaceholders(sql), values);

      return result.rows as unknown as T[];
    },
    async exec(sql: string) {
      await ready();

      const active = activeTransaction.getStore();

      if (active) {
        await active.client.query(sql);

        return;
      }

      await pool.query(sql);
    },
    transaction,
    async ready() {
      await ready();
    },
    async close() {
      await pool.end?.();
    },
  };
}
