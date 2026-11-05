"use client";

import type { ReactNode } from "react";

import Link from "next/link";

/**
 * The click is best-effort and never blocks navigation. Anonymous visitors and
 * failed writes simply produce no funnel event; they do not create a profile.
 */
export function ModelClickLink({
  href,
  contentId,
  modelId,
  className,
  children,
}: {
  href: string;
  contentId?: string;
  modelId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        if (!contentId) return;

        void fetch("/api/account/content/model-click", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contentId, modelId }),
          keepalive: true,
        }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
