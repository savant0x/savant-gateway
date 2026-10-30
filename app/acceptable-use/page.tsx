import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/policy-document";
import { POLICIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: POLICIES["acceptable-use"].title,
  description: POLICIES["acceptable-use"].summary,
};

export default function AcceptableUsePage() {
  return <PolicyDocument slug="acceptable-use" />;
}
