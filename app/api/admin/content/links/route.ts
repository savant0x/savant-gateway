import type { ContentRelation } from "@/lib/content/types";

import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { CONTENT_RELATIONS } from "@/lib/content/types";
import {
  dismissAutoLink,
  listLinksForItem,
  manualLink,
} from "@/lib/content/store/links";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const itemId = new URL(request.url).searchParams.get("itemId")?.trim();

  if (!itemId) return adminError(400, "itemId is required.");

  const db = await getDatabase();

  return Response.json(
    { links: await listLinksForItem(db, itemId) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const itemId = stringField(body, "itemId");
  const modelId = stringField(body, "modelId");
  const relation = stringField(body, "relation") as ContentRelation;

  if (!itemId || !modelId) {
    return adminError(400, "itemId and modelId are required.");
  }

  if (!CONTENT_RELATIONS.includes(relation)) {
    return adminError(400, "relation is not a known content relation.");
  }

  const db = await getDatabase();

  await manualLink(db, itemId, modelId, relation);

  return Response.json({ linked: true }, { status: 201, headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const itemId = stringField(body, "itemId");
  const modelId = stringField(body, "modelId");

  if (!itemId || !modelId) {
    return adminError(400, "itemId and modelId are required.");
  }

  const db = await getDatabase();
  const removed = await dismissAutoLink(db, itemId, modelId);

  return removed
    ? Response.json({ dismissed: true }, { headers: NO_STORE })
    : adminError(404, "No automatic link matched that pair.");
}
