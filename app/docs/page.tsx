import type { Metadata } from "next";

import { ApiReference } from "@/components/docs/api-reference";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "Savant Gateway API reference: authentication, the model payload, provider identity, family, price groups, chat completions, and errors.",
  // `opengraph-image.tsx` supplies this page's card. Dropping the inherited
  // Twitter image lets the crawler fall back to that card, and the card type is
  // restated because a partial `twitter` object otherwise downgrades it to the
  // small summary card.
  twitter: { card: "summary_large_image", images: [] },
};

export default function DocsPage() {
  return <ApiReference />;
}
