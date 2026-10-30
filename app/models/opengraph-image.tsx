import { ImageResponse } from "next/og";

import { formatNumber } from "@/components/dashboard/format";
import { socialCard } from "@/lib/social-card";
import { getCatalogData } from "@/lib/store";

export const runtime = "nodejs";
/**
 * Rendered per request, not baked at build: a build-time snapshot would freeze
 * whatever counts the build's database held and then disagree with the page
 * after the next provider sync.
 */
export const dynamic = "force-dynamic";
export const alt =
  "Savant Gateway model catalog — every enabled model with its family, billing group and per-million-token price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Counts come from the same `getCatalogData()` call the page renders, so a
 * share of /models cannot advertise a catalog size the page does not show.
 */
export default function Image() {
  const { stats } = getCatalogData();

  return new ImageResponse(
    socialCard({
      eyebrow: "Model catalog",
      title: `${formatNumber(stats.modelCount)} models. Priced apart.`,
      subtitle:
        "Input and output rates per 1M tokens, with the public list rate beside ours.",
      lines: [
        `${formatNumber(stats.freeModelCount)} free · ${formatNumber(stats.paidModelCount)} priced · ${formatNumber(stats.subscriptionModelCount)} subscription-only`,
        "Weighted free pool · prepaid credit · plan allowance",
      ],
    }),
    { ...size },
  );
}
