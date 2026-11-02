import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { seedContentSources } from "@/lib/content/presets";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  try {
    const db = await getDatabase();
    const result = await seedContentSources(db);

    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return adminError(
      400,
      error instanceof Error
        ? error.message
        : "The presets could not be added.",
    );
  }
}
