import { ImageResponse } from "next/og";

import { socialCard } from "@/lib/social-card";

export const runtime = "nodejs";
export const alt =
  "Savant Gateway newcomer guide — account, key, model choice, first request and first bill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    socialCard({
      eyebrow: "Newcomer guide",
      title: "Your first request.",
      subtitle:
        "One account, one key, one OpenAI-compatible call — and a bill you can read.",
      lines: ["Create an account and key", "Choose a free, paid or plan model"],
    }),
    { ...size },
  );
}
