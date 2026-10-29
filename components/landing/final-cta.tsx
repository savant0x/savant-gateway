import Link from "next/link";

import { primaryCta, secondaryCta } from "./cta";

export function FinalCta() {
  return (
    <section className="closing-cta">
      <p className="section-kicker justify-center">Savant // Gateway</p>
      <h2 className="mt-6">
        The right intelligence.<span>At a price that makes sense.</span>
      </h2>
      <p>
        Explore the catalog. Compare the costs.
        <br />
        Put the model that fits your work to work.
      </p>
      <div className="hero-actions justify-center">
        <Link className={primaryCta} href="/signup">
          Create an account{" "}
          <i aria-hidden className="fa-solid fa-arrow-right" />
        </Link>
        <Link className={secondaryCta} href="/models">
          Compare models
        </Link>
      </div>
    </section>
  );
}
