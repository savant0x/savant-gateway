/**
 * Value readers for upstream payloads.
 *
 * These are the only coercions a shape is allowed to use, so "a blank string",
 * "a numeric string" and "a negative number" mean the same thing in every
 * provider's mapping instead of once per read site.
 */
import type { RawEntry } from "./types.ts";

export function recordOf(value: unknown): RawEntry | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawEntry)
    : null;
}

/** A non-negative finite number, from a number or a non-blank numeric string. */
export function asNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return "";
}

/** `null` distinguishes "not declared" from a declared `false`. */
export function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Splits a comma-separated modality list; `null` when nothing is declared. */
export function asModalities(value: unknown): string[] | null {
  const text = asText(value);

  if (!text) return null;

  const parts = text
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  return parts.length > 0 ? parts : null;
}
