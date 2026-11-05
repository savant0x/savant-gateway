import { stripHtml } from "./feed-xml.ts";
import { CONTENT_LIMITS } from "./policy.ts";

/** Extract bounded, visible description text without matching URL contents. */
export function descriptionEvidence(
  bodyHtml: string | null,
  excerpt: string,
): string {
  const input = (bodyHtml ?? excerpt).slice(0, CONTENT_LIMITS.maxBodyChars);
  const separated = input.replace(/<\/?(?:p|br|div|li|h[1-6])\b[^>]*>/gi, " ");

  return stripHtml(separated)
    .replace(/(?:https?:\/\/|www\.|\/\/)\S+/gi, " ")
    .slice(0, CONTENT_LIMITS.maxBodyChars);
}
