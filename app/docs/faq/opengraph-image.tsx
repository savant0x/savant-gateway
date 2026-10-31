import { ImageResponse } from "next/og";

import { socialCard } from "@/lib/social-card";

export const runtime = "nodejs";
export const alt =
  "Savant Gateway FAQ — access, models, billing, holds, top-ups, errors, privacy and support";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    socialCard({
      eyebrow: "FAQ",
      title: "Questions, answered.",
      subtitle:
        "Access, billing, holds, top-ups, errors and the honest limits of the service.",
      lines: [
        "Free pool · paid credit · plan allowance",
        "Start here · API reference · Support",
      ],
    }),
    { ...size },
  );
}
