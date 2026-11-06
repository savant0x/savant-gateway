/**
 * Compatibility surface for the former ported payment state machine.
 *
 * FID-2026-1105-010 selected `payment-events.ts` as the single claim authority.
 * This module re-exports it so existing imports cannot drift into a second
 * read-then-write implementation.
 */
export * from "./payment-events.ts";
