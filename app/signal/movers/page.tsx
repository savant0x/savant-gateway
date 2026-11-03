import type { Metadata } from "next";

import { MomentumPage } from "@/components/content/momentum-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signal top movers — largest measured change",
  description:
    "Signal items with the largest absolute change in source-reported views, likes, comments or repository stars over a named window.",
};

export default function SignalMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; window?: string }>;
}) {
  return <MomentumPage mode="movers" searchParams={searchParams} />;
}
