import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { parseSourceBody } from "@/lib/content/admin-input";
import {
  deleteSource,
  getSource,
  setSourceEnabled,
  updateSource,
} from "@/lib/content/store/sources";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const { id } = await params;

  try {
    const db = await getDatabase();
    const current = await getSource(db, id);

    if (!current) return adminError(404, "Source not found.");

    if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
      const changed = await setSourceEnabled(db, id, body.enabled);

      return changed
        ? Response.json(
            { source: await getSource(db, id) },
            { headers: NO_STORE },
          )
        : adminError(404, "Source not found.");
    }

    const parsed = parseSourceBody({
      kind: body.kind ?? current.kind,
      label: body.label ?? current.label,
      url: body.url ?? current.url,
      tags: body.tags ?? current.config.tags.join(", "),
      channelId: body.channelId ?? current.config.channelId ?? "",
      enabled: body.enabled ?? current.enabled,
      fetchIntervalMinutes:
        body.fetchIntervalMinutes ?? current.fetchIntervalMinutes,
      maxItems: body.maxItems ?? current.maxItems,
    });

    if (!parsed.ok) return adminError(400, parsed.error);

    const source = await updateSource(db, id, parsed.value);

    return source
      ? Response.json({ source }, { headers: NO_STORE })
      : adminError(404, "Source not found.");
  } catch (error) {
    return adminError(
      400,
      error instanceof Error
        ? error.message
        : "The source could not be updated.",
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const db = await getDatabase();
  const { id } = await params;
  const removed = await deleteSource(db, id);

  return removed
    ? Response.json({ deleted: true }, { headers: NO_STORE })
    : adminError(404, "Source not found.");
}
