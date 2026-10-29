import { LandingPage } from "@/components/landing/landing-page";
import { getLandingData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <LandingPage data={getLandingData()} />;
}
