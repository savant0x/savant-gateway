import type { PostgresDatabase } from "./pg-adapter.ts";

export type TableRef = {
  schema: string;
  table: string;
};

export function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableKey(table: TableRef) {
  return `${table.schema}.${table.table}`;
}

export function qualifiedTable(table: TableRef) {
  return `${quote(table.schema)}.${quote(table.table)}`;
}

async function tableNames(db: PostgresDatabase): Promise<TableRef[]> {
  const rows = await db.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_schema NOT LIKE 'pg_%'
      ORDER BY table_schema, table_name`,
  );

  return rows.map((row) => ({
    schema: row.table_schema,
    table: row.table_name,
  }));
}

/**
 * Parents before children, from the catalog itself. A cycle (none exist today)
 * is broken alphabetically and reported by the caller's row counts rather than
 * by a failed insert.
 */
export async function foreignKeyOrder(
  db: PostgresDatabase,
): Promise<TableRef[]> {
  const tables = await tableNames(db);
  const byKey = new Map(tables.map((table) => [tableKey(table), table]));
  const edges = await db.query<{
    child_schema: string;
    child: string;
    parent_schema: string;
    parent: string;
  }>(
    `SELECT cn.nspname AS child_schema, c.relname AS child,
            pn.nspname AS parent_schema, p.relname AS parent
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace cn ON cn.oid = c.relnamespace
       JOIN pg_class p ON p.oid = con.confrelid
       JOIN pg_namespace pn ON pn.oid = p.relnamespace
      WHERE con.contype = 'f'
        AND cn.nspname NOT IN ('pg_catalog', 'information_schema')
        AND cn.nspname NOT LIKE 'pg_%'
        AND pn.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pn.nspname NOT LIKE 'pg_%'
        AND NOT (cn.nspname = pn.nspname AND c.relname = p.relname)`,
  );
  const parents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>(
    tables.map((table) => [tableKey(table), 0]),
  );

  for (const edge of edges) {
    const childKey = `${edge.child_schema}.${edge.child}`;
    const parentKey = `${edge.parent_schema}.${edge.parent}`;

    if (!byKey.has(childKey) || !byKey.has(parentKey)) continue;

    const set = parents.get(parentKey) ?? new Set<string>();

    if (set.has(childKey)) continue;

    set.add(childKey);
    parents.set(parentKey, set);
    indegree.set(childKey, (indegree.get(childKey) ?? 0) + 1);
  }

  const ready = tables
    .filter((table) => indegree.get(tableKey(table)) === 0)
    .sort((left, right) => tableKey(left).localeCompare(tableKey(right)));
  const order: string[] = [];

  while (ready.length > 0) {
    const table = ready.shift() as TableRef;
    const key = tableKey(table);

    order.push(key);

    const children = parents.get(key);

    if (!children) continue;

    for (const child of Array.from(children)) {
      const next = (indegree.get(child) ?? 0) - 1;

      indegree.set(child, next);

      if (next === 0) {
        const childTable = byKey.get(child);

        if (childTable) {
          ready.push(childTable);
          ready.sort((left, right) =>
            tableKey(left).localeCompare(tableKey(right)),
          );
        }
      }
    }
  }

  const remaining = tables
    .filter((table) => !order.includes(tableKey(table)))
    .sort((left, right) => tableKey(left).localeCompare(tableKey(right)));
  const resolved = order
    .map((key) => byKey.get(key))
    .filter((table): table is TableRef => Boolean(table));

  return [...resolved, ...remaining];
}

export async function columnsOf(
  db: PostgresDatabase,
  table: TableRef,
  rows: unknown[],
) {
  if (rows.length > 0) {
    return Object.keys(rows[0] as Record<string, unknown>);
  }

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position`,
    [table.schema, table.table],
  );

  return columns.map((row) => row.column_name);
}
