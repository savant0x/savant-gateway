/**
 * The one place that knows how a duplicate promo code reports itself.
 *
 * SQLite raised `SQLITE_CONSTRAINT`; PostgreSQL raises SQLSTATE `23505`
 * (`unique_violation`). Both promo creation and redemption depend on telling a
 * duplicate apart from a real failure, and a copy in each module would let them
 * drift — a second copy that stopped matching would turn an ordinary repeated
 * submission into a 500.
 */
export function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505";
}
