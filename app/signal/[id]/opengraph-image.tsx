import { ImageResponse } from "next/og";

import { contentDate, kindLabel } from "@/lib/content/format";
import { getItem } from "@/lib/content/store/items";
import { socialCard } from "@/lib/social-card";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const revalidate = 300;
export const alt =
  "A Signal item from Savant Gateway with its title, kind, source and publication date";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fallbackCard() {
  return socialCard({
    eyebrow: "Signal",
    title: "Free AI discovery, linked to live prices.",
    subtitle:
      "Articles, videos, papers, repositories, and discussions with the models they name.",
    lines: ["Source-reported momentum", "Savant Gateway pricing"],
  });
}

/**
 * Per-item social card (FID-2026-1103-123). A missing row still renders a
 * valid card rather than a broken image, and the text is drawn only from the
 * public item fields the detail page already renders.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let card = fallbackCard();

  try {
    const item = await getItem(await getDatabase(), (await params).id);

    if (item) {
      card = socialCard({
        eyebrow: kindLabel(item.kind),
        title: item.title.slice(0, 92),
        subtitle:
          item.excerpt.slice(0, 140) || `Published by ${item.sourceLabel}.`,
        lines: [
          `${item.sourceLabel} · ${contentDate(item.publishedAt)}`,
          item.tags.length > 0
            ? item.tags
                .slice(0, 3)
                .map((tag) => `#${tag}`)
                .join("  ")
            : "Savant Gateway Signal",
        ],
      });
    }
  } catch {
    // A storage outage must not turn a shared link into a broken card.
  }

  return new ImageResponse(card, { ...size });
}
