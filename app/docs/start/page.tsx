import type { Metadata } from "next";

import { NewcomerGuide } from "@/components/docs/newcomer-guide";

export const metadata: Metadata = {
  title: "Newcomer guide",
  description:
    "Start using Savant Gateway: create an account and key, choose a billing group, send the first OpenAI-compatible request, and understand the first charge.",
};

export default function DocsStartPage() {
  return <NewcomerGuide />;
}
