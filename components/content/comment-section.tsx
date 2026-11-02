import type { ContentComment } from "@/lib/content/types";

import Link from "next/link";

import { CommentForm } from "@/components/content/comment-form";
import { contentDate } from "@/lib/content/format";

export function CommentSection({
  itemId,
  comments,
  count,
  signedIn,
}: {
  itemId: string;
  comments: ContentComment[];
  count: number;
  signedIn: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10"
      id="discussion"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Discussion</h2>
        <span className="text-[11px] text-muted">
          {count === 1 ? "1 comment" : `${count} comments`} on Savant Gateway
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted">
        This discussion is ours, not the publisher&apos;s. The thread is public.
        Sign in to post; the source&apos;s own comment count, when reported,
        appears in the details panel.
      </p>

      {signedIn ? (
        <CommentForm itemId={itemId} />
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-black/15 px-3 py-2 text-xs text-muted dark:border-white/15">
          <Link className="text-accent hover:underline" href="/login">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="mt-4 text-xs text-muted">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span className="font-semibold text-foreground">
                  {comment.authorName}
                </span>
                <span>{contentDate(comment.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm leading-6">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
