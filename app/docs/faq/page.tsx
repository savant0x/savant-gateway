import type { Metadata } from "next";

import { Faq } from "@/components/docs/faq";
import { FaqJsonLd } from "@/components/docs/faq-jsonld";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about Savant Gateway accounts, keys, free and paid models, billing holds, top-ups, refunds, errors, privacy and support.",
};

export default function DocsFaqPage() {
  return (
    <>
      <FaqJsonLd />
      <Faq />
    </>
  );
}
