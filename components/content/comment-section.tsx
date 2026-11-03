import type { ContentComment } from "@/lib/content/types";

import Link from "next/link";

import { CommentForm } from "@/components/content/comment-form";
import { DeleteCommentButton } from "@/components/content/delete-comment-button";
import { contentDate } from "@/lib/content/format";

function CommentBody({
  comment,
  itemId,
}: {
  comment: ContentComment;
  itemId: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="font-semibold text-foreground">
          {comment.authorName}
        </span>
        <span className="flex items-center gap-2">
          <span>{contentDate(comment.createdAt)}</span>
          {comment.canDelete ? (
            <DeleteCommentButton commentId={comment.id} itemId={itemId} />
          ) : null}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-line text-sm leading-6">
        {comment.body}
      </p>
    </div>
  );
}

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
  const topLevel = comments.filter((comment) => !comment.parentId);
  const topLevelIds = new Set(topLevel.map((comment) => comment.id));
  const repliesFor = new Map<string, ContentComment[]>();

  for (const comment of comments) {
    if (!comment.parentId || !topLevelIds.has(comment.parentId)) continue;

    const group = repliesFor.get(comment.parentId) ?? [];

    group.push(comment);
    repliesFor.set(comment.parentId, group);
  }

  // A reply whose parent fell outside the read limit still renders, plainly
  // labelled, rather than disappearing from the discussion.
  const orphanReplies = comments.filter(
    (comment) => comment.parentId && !topLevelIds.has(comment.parentId),
  );

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
        appears in the details panel. One level of replies is supported.
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
          {topLevel.map((comment) => {
            const replies = (repliesFor.get(comment.id) ?? []).sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            );

            return (
              <li key={comment.id}>
                <CommentBody comment={comment} itemId={itemId} />
                {signedIn ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-muted underline-offset-4 hover:text-foreground hover:underline">
                      Reply to {comment.authorName}
                    </summary>
                    <CommentForm
                      itemId={itemId}
                      parentId={comment.id}
                      placeholder={`Reply to ${comment.authorName}…`}
                      submitLabel="Post reply"
                    />
                  </details>
                ) : null}
                {replies.length > 0 ? (
                  <ul className="ml-4 mt-3 space-y-3 border-l border-black/10 pl-3 dark:border-white/10">
                    {replies.map((reply) => (
                      <li key={reply.id}>
                        <CommentBody comment={reply} itemId={itemId} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {orphanReplies.map((comment) => (
            <li key={comment.id}>
              <p className="mb-1 text-[11px] text-muted">
                Reply to a comment not shown on this page
              </p>
              <CommentBody comment={comment} itemId={itemId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
