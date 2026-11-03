import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { deleteComment } from "@/lib/content/store/comments";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator moderation: deletes any comment, and its replies cascade. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const commentId = (await params).id.trim();

  if (!commentId) return adminError(400, "A comment id is required.");

  const db = await getDatabase();
  const deleted = await deleteComment(db, commentId, { operator: true });

  if (!deleted) return adminError(404, "That comment does not exist.");

  return Response.json({ deleted: true }, { headers: NO_STORE });
}
