import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

/** Lock the parent before any link so decisions and rematches share an order. */
export async function lockContentItem(
  db: PostgresDatabase,
  itemId: string,
): Promise<void> {
  await db
    .prepare("SELECT id FROM content.items WHERE id = ? FOR UPDATE")
    .get(itemId);
}
