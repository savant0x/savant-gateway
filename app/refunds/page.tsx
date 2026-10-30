import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/policy-document";
import { POLICIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: POLICIES.refunds.title,
  description: POLICIES.refunds.summary,
};

export default function RefundsPage() {
  return <PolicyDocument slug="refunds" />;
}
