/**
 * Stable keyset pagination shared by content history and link inventory.
 * Values are opaque base64url JSON so a caller cannot invent a tuple shape that
 * the SQL then interpolates.
 */

export type PageCursor = string[];

export function encodeCursor(values: PageCursor): string {
  return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

export function decodeCursor(
  value: string | null | undefined,
  expectedParts: number,
): PageCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;

    if (
      !Array.isArray(parsed) ||
      parsed.length !== expectedParts ||
      parsed.some((part) => typeof part !== "string" || part.length === 0)
    ) {
      return null;
    }

    return parsed as string[];
  } catch {
    return null;
  }
}

export function clampPageLimit(
  value: string | null | undefined,
  fallback = 50,
  max = 100,
): number {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1) return fallback;

  return Math.min(max, number);
}
