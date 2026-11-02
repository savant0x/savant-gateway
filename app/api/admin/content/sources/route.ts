import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { parseSourceBody } from "@/lib/content/admin-input";
import { createSource, listSources } from "@/lib/content/store/sources";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const db = await getDatabase();

  return Response.json(
    { sources: await listSources(db) },
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

  const parsed = parseSourceBody(body);

  if (!parsed.ok) return adminError(400, parsed.error);

  try {
    const db = await getDatabase();
    const source = await createSource(db, parsed.value);

    return Response.json({ source }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return adminError(
      400,
      error instanceof Error
        ? error.message
        : "The source could not be created.",
    );
  }
}
