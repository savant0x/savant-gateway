import { customerError, requireCustomerApi } from "@/lib/customer-auth";
import { CONTENT_LIMITS, contentEnabled } from "@/lib/content/policy";
import {
  addComment,
  CommentParentError,
  CommentRateLimitError,
  deleteComment,
} from "@/lib/content/store/comments";
import { getItem } from "@/lib/content/store/items";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Posts a comment on a Signal item (FID-2026-1102-092).
 *
 * Authenticated, same-origin, bounded, and stored as plain text. Rendering in
 * React escapes it; nothing here permits markup.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!contentEnabled()) return customerError(404, "Signal is not enabled.");

  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const text =
    typeof body.body === "string"
      ? body.body.replace(/\r\n/g, "\n").trim()
      : "";
  const parentId =
    typeof body.parentId === "string" ? body.parentId.trim() || null : null;

  if (body.parentId !== undefined && body.parentId !== null && !parentId) {
    return customerError(400, "That reply target is not valid.");
  }

  if (!text) return customerError(400, "Write a comment first.");

  if (text.length > CONTENT_LIMITS.commentMaxChars) {
    return customerError(
      400,
      `Comments are limited to ${CONTENT_LIMITS.commentMaxChars} characters.`,
    );
  }

  const itemId = (await params).id;
  const db = await getDatabase();
  const item = await getItem(db, itemId);

  if (!item) return customerError(404, "That item does not exist.");

  try {
    const comment = await addComment(db, customer.id, item.id, text, {
      parentId,
    });

    return Response.json(
      { comment },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommentParentError) {
      return customerError(400, error.message);
    }

    if (error instanceof CommentRateLimitError) {
      return customerError(429, error.message);
    }

    return customerError(500, "Could not save that comment.");
  }
}

/** Deletes the caller's own comment on this item; replies cascade. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!contentEnabled()) return customerError(404, "Signal is not enabled.");

  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const commentId = new URL(request.url).searchParams.get("commentId")?.trim();

  if (!commentId) return customerError(400, "A comment id is required.");

  const db = await getDatabase();
  const deleted = await deleteComment(db, commentId, {
    userId: customer.id,
    itemId: (await params).id,
  });

  if (!deleted) return customerError(404, "That comment does not exist.");

  return Response.json(
    { deleted: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
