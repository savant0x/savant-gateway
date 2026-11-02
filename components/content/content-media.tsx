"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import fallbackImage from "@/assets/thumb.jpg";
import { videoEmbedUrl } from "@/lib/content/format";

const SIGNAL_FALLBACK_IMAGE = fallbackImage.src;

/**
 * Card media (FID-2026-1102-093).
 *
 * A video thumbnail is a trigger: it opens the YouTube player in a modal, the
 * behavior the reference site had. An article thumbnail is a plain link to the
 * detail page. The modal is portaled to `body` so the card's `overflow-hidden`
 * cannot clip it, and focus returns to the trigger on close.
 */
export function ContentMedia({
  itemId,
  title,
  videoId,
  thumbnailUrl,
  sourceLabel,
}: {
  itemId: string;
  title: string;
  videoId: string | null;
  thumbnailUrl: string | null;
  sourceLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const embed = videoEmbedUrl(videoId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const imageUrl = thumbnailUrl || SIGNAL_FALLBACK_IMAGE;
  const media = (
    <span
      aria-hidden
      className="relative block h-36 w-full overflow-hidden bg-neutral-900"
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <span className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/25" />
      {sourceLabel ? (
        <span className="absolute left-2.5 top-2.5 z-10 max-w-[75%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm">
          {sourceLabel}
        </span>
      ) : null}
      {videoId ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
            <span className="ml-1 block h-0 w-0 border-y-[7px] border-l-[12px] border-y-transparent border-l-white" />
          </span>
        </span>
      ) : null}
    </span>
  );

  if (!embed) {
    return (
      <Link
        aria-label={`Open ${title}`}
        className="group block"
        href={`/signal/${itemId}`}
      >
        {media}
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-label={`Play ${title}`}
        className="group block w-full cursor-pointer text-left"
        type="button"
        onClick={() => setOpen(true)}
      >
        {media}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                aria-label={title}
                aria-modal="true"
                className="w-full max-w-4xl"
                role="dialog"
              >
                <div className="flex items-center justify-between gap-3 pb-2 text-white">
                  <p className="line-clamp-1 text-sm font-medium">{title}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      className="text-xs text-cyan-200 underline-offset-4 hover:underline"
                      href={`/signal/${itemId}`}
                    >
                      Full page →
                    </Link>
                    <button
                      ref={closeRef}
                      aria-label="Close video"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/30 text-sm text-white transition-colors hover:bg-white/10"
                      type="button"
                      onClick={close}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="aspect-video overflow-hidden rounded-xl border border-white/20 bg-black">
                  <iframe
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    className="h-full w-full"
                    referrerPolicy="strict-origin-when-cross-origin"
                    src={videoEmbedUrl(videoId, true) ?? embed}
                    title={title}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
