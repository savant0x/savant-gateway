/**
 * A vendor's prefix-group document, read by content.
 *
 * `/models` answers "what can be called"; this answers "how is it pooled and
 * what does the vendor change before it reaches the model". Each entry names a
 * prefix group with the publishers currently behind it and, sometimes, a system
 * prompt the vendor prepends. Nothing here routes, prices or rewrites: the
 * snapshot exists so an operator can see both facts before publishing a model.
 *
 * Recognised by shape, never by provider slug — an array of objects that carry a
 * string `prefix`, or an object wrapping one under `data`, `groups` or `catalog`.
 */

export type ProviderCatalogGroup = {
  /** Id prefix the group serves, e.g. `qwencloud-alibaba`. */
  prefix: string;
  slug: string | null;
  label: string | null;
  status: string | null;
  enabled: boolean;
  /** Publishers pooled behind this prefix, as the vendor reports them. */
  activeProviders: number | null;
  /** A system prompt the vendor prepends; shown, never applied. */
  systemPromptNote: string | null;
  modelCount: number;
};

const MAX_NOTE_LENGTH = 500;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function capacity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function entries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const body = record(payload);

  for (const key of ["data", "groups", "catalog"]) {
    const list = body?.[key];

    if (Array.isArray(list)) return list;
  }

  throw new Error(
    "Vendor catalog groups were not a list; refusing to replace the snapshot.",
  );
}

export function readCatalogGroups(payload: unknown): ProviderCatalogGroup[] {
  const seen = new Set<string>();
  const groups: ProviderCatalogGroup[] = [];

  for (const entry of entries(payload)) {
    const item = record(entry);
    const prefix = text(item?.prefix);

    // An entry without a prefix names no group, so it cannot be displayed or
    // replaced; a duplicate prefix is the same group published twice.
    if (!item || !prefix || seen.has(prefix)) continue;

    seen.add(prefix);

    const note = text(item.systemPromptNote);

    groups.push({
      prefix,
      slug: text(item.slug),
      label: text(item.label),
      status: text(item.status),
      enabled: item.enabled === true,
      activeProviders: capacity(item.activeProviders),
      systemPromptNote: note ? note.slice(0, MAX_NOTE_LENGTH) : null,
      modelCount: Array.isArray(item.models) ? item.models.length : 0,
    });
  }

  return groups;
}
