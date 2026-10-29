import { Dashboard } from "@/components/dashboard";
import { getOverview } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Dashboard initial={getOverview()} />;
}
