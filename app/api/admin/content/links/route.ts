import type { ContentRelation } from "@/lib/content/types";

import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  decideLink,
  manualLink,
  type LinkDecisionAction,
} from "@/lib/content/store/link-writes";
import { listLinksForItem } from "@/lib/content/store/links";
import { CONTENT_RELATIONS } from "@/lib/content/types";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: LinkDecisionAction[] = ["accept", "dismiss", "restore"];

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  return typeof value === "string" ? value.trim() : "";
}

function revisionField(
  body: Record<string, unknown>,
): number | undefined | null {
  if (!("expectedRevision" in body)) return undefined;

  const value = body.expectedRevision;

  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const itemId = new URL(request.url).searchParams.get("itemId")?.trim();

  if (!itemId) return adminError(400, "itemId is required.");

  const db = await getDatabase();

  return Response.json(
    { links: await listLinksForItem(db, itemId, { includeHidden: true }) },
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
  const action = stringField(body, "action");
  const expectedRevision = revisionField(body);

  if (!itemId || !modelId) {
    return adminError(400, "itemId and modelId are required.");
  }

  if (expectedRevision === null) {
    return adminError(400, "expectedRevision must be a non-negative integer.");
  }

  const db = await getDatabase();

  if (action) {
    if (!ACTIONS.includes(action as LinkDecisionAction)) {
      return adminError(400, "action must be accept, dismiss or restore.");
    }

    const result = await decideLink(db, {
      itemId,
      modelId,
      action: action as LinkDecisionAction,
      expectedRevision,
    });

    if (!result.ok) {
      return result.missing
        ? adminError(404, "No model link matches that pair.")
        : adminError(409, "The link changed. Refresh and decide again.");
    }

    return Response.json(
      { state: result.state, revision: result.revision },
      { headers: NO_STORE },
    );
  }

  const relation = stringField(body, "relation") as ContentRelation;

  if (!CONTENT_RELATIONS.includes(relation)) {
    return adminError(400, "relation is not a known content relation.");
  }

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
  const expectedRevision = revisionField(body);

  if (!itemId || !modelId) {
    return adminError(400, "itemId and modelId are required.");
  }

  if (expectedRevision === null) {
    return adminError(400, "expectedRevision must be a non-negative integer.");
  }

  const db = await getDatabase();
  const result = await decideLink(db, {
    itemId,
    modelId,
    action: "dismiss",
    expectedRevision,
  });

  if (!result.ok) {
    return result.missing
      ? adminError(404, "No model link matches that pair.")
      : adminError(409, "The link changed. Refresh and decide again.");
  }

  return Response.json(
    { dismissed: true, state: result.state, revision: result.revision },
    { headers: NO_STORE },
  );
}
