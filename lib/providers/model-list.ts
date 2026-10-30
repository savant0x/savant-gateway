import type { UpstreamModel } from "./types";

export type UpstreamModelPage = {
  /** Entries with a usable id, in source order. */
  models: UpstreamModel[];
  /** Raw entries on the page, before unusable ones are dropped. */
  received: number;
  hasMore: boolean;
  lastId: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validates an OpenAI/Anthropic-style `/models` envelope before anything can
 * overwrite the catalog. A 200 that is an error object, an HTML page or a
 * truncated body is not an empty catalog: only an explicit `data: []` is.
 */
export function readUpstreamModelPage(payload: unknown): UpstreamModelPage {
  const body = record(payload);

  if (!body) {
    throw new Error("Upstream catalog response was not a JSON object.");
  }

  if (!Array.isArray(body.data)) {
    throw new Error(
      "Upstream catalog response had no model list; refusing to replace the catalog.",
    );
  }

  const data = body.data;
  const models: UpstreamModel[] = [];

  for (const entry of data) {
    const item = record(entry);
    const id = typeof item?.id === "string" ? item.id.trim() : "";

    if (item && id) models.push({ ...item, id } as UpstreamModel);
  }

  if (data.length > 0 && models.length === 0) {
    // A non-empty page where no entry carries an id is a shape change or a
    // corrupt body, not a delisting of every model.
    throw new Error(
      "Upstream catalog response contained no usable model ids; refusing to replace the catalog.",
    );
  }

  const lastId = typeof body.last_id === "string" ? body.last_id.trim() : "";

  return {
    models,
    received: data.length,
    hasMore: body.has_more === true,
    lastId: lastId || null,
  };
}
