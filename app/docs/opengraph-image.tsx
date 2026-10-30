import { ImageResponse } from "next/og";

import { socialCard } from "@/lib/social-card";

export const runtime = "nodejs";
export const alt =
  "Savant Gateway API reference — one OpenAI-compatible endpoint, account-owned keys, streaming and errors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The documented surface is the page's own content; nothing here is invented. */
export default function Image() {
  return new ImageResponse(
    socialCard({
      eyebrow: "API reference",
      title: "One endpoint. Every model.",
      subtitle:
        "Authentication, the catalog payload, streaming, and the errors that mean something.",
      lines: [
        "POST /v1/chat/completions · GET /v1/models",
        "Authorization: Bearer sk-… · x-api-key",
      ],
    }),
    { ...size },
  );
}
