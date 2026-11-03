"use client";

import type { AdminContentComment } from "@/lib/content/types";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { contentDate } from "@/lib/content/format";

export function ContentCommentModeration({
  comments,
}: {
  comments: AdminContentComment[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(comment: AdminContentComment) {
    if (busyId) return;
    if (
      !window.confirm(
        `Delete ${comment.authorName}'s comment on "${comment.itemTitle}"? Replies are deleted too.`,
      )
    ) {
      return;
    }

    setBusyId(comment.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/content/comments/${encodeURIComponent(comment.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };

        throw new Error(payload.error ?? "Could not delete that comment.");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete that comment.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold">Recent comments</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Delete removes the comment and its replies. The public thread shows only
        the author name; the email here is operator-only.
      </p>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <div className="mt-4 space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-muted">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg bg-black/[0.02] px-3 py-2 text-xs dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {comment.authorName}
                  {comment.authorEmail ? (
                    <span className="ml-2 font-normal text-muted">
                      {comment.authorEmail}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted">
                  {contentDate(comment.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line leading-5">
                {comment.body}
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-muted">
                <span className="truncate">{comment.itemTitle}</span>
                <button
                  className="text-[11px] text-danger underline-offset-4 hover:underline disabled:opacity-50"
                  disabled={busyId !== null}
                  type="button"
                  onClick={() => remove(comment)}
                >
                  {busyId === comment.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
