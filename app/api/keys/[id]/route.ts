import { localOnlyError } from "@/lib/http";
import { revokeApiKey } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = localOnlyError(request);

  if (blocked) return blocked;

  const { id } = await context.params;

  if (!revokeApiKey(id)) {
    return Response.json({ error: "API key not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
