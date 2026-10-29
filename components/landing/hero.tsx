import type { LandingData } from "@/lib/types";

import Link from "next/link";

import { primaryCta, secondaryCta } from "./cta";
import { ModelPriceEngine } from "./model-price-engine";

export function Hero({ data }: { data: LandingData }) {
  return (
    <section className="landing-hero">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-hero-grid">
          <div>
            <p className="section-kicker">The Savant inference platform</p>
            <h1>
              Frontier models.<span>Grounded prices.</span>
            </h1>
            <p className="hero-description">
              The intelligence your work deserves, with costs you can see.
              Compare models, choose your price point, and build through one
              API.
            </p>
            <div className="hero-actions">
              <Link className={primaryCta} href="#models">
                Compare models{" "}
                <i aria-hidden className="fa-solid fa-arrow-right" />
              </Link>
              <Link className={secondaryCta} href="/docs">
                Explore the API <i aria-hidden className="fa-solid fa-code" />
              </Link>
            </div>
            <p className="hero-note">
              <i
                aria-hidden
                className="fa-solid fa-code-branch mr-2 text-accent"
              />
              OpenAI-compatible · Your tools. Your workflow.
            </p>
          </div>
          <ModelPriceEngine models={data.models} />
        </div>
        <div className="landing-strip">
          <span>
            Multiple model families <span className="text-accent">/</span> One
            connection
          </span>
          <span>
            Individual keys <span className="text-accent">/</span> Recorded
            usage
          </span>
          <span>{data.stats.modelCount} models in the current catalog</span>
        </div>
      </div>
    </section>
  );
}
