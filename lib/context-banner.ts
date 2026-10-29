/**
 * Operator-authored context banner. The gateway prepends it as a system
 * message to every upstream request when enabled, so any agent pointed at the
 * gateway carries the same notice. The text is plain UTF-8; the gateway adds no
 * markup around it.
 */
export const CONTEXT_BANNER_MAX_CHARS = 2_000;

export type ContextBanner = {
  enabled: boolean;
  text: string;
};

export type BannerValidation =
  { ok: true; text: string } | { ok: false; error: string };

/** Collapses CRLF, drops control characters other than tab and newline. */
export function normalizeBannerText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function validateBannerText(raw: unknown): BannerValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: "Banner text must be a string." };
  }

  const text = normalizeBannerText(raw);

  if (text.length > CONTEXT_BANNER_MAX_CHARS) {
    return {
      ok: false,
      error: `Banner text cannot exceed ${CONTEXT_BANNER_MAX_CHARS.toLocaleString("en-US")} characters.`,
    };
  }

  return { ok: true, text };
}

/** Prepends one system message without mutating the caller's array. */
export function withContextBanner(
  messages: unknown[],
  text: string,
): unknown[] {
  const banner = normalizeBannerText(text);

  if (!banner) return messages;

  return [{ role: "system", content: banner }, ...messages];
}
