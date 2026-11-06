import type { Metadata } from "next";

import { NewcomerGuide } from "@/components/docs/newcomer-guide";

export const metadata: Metadata = {
  title: "Newcomer guide",
  description:
    "Get started with available GPT, Claude, and other models: create a key, send a Chat Completions request, and understand billing.",
};

export default function DocsStartPage() {
  return <NewcomerGuide />;
}
