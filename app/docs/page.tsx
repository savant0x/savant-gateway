import type { Metadata } from "next";

import { ApiReference } from "@/components/docs/api-reference";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "Savant Gateway API reference: authentication, the model payload, provider identity, family, price groups, chat completions, and errors.",
};

export default function DocsPage() {
  return <ApiReference />;
}
