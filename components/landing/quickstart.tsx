import Link from "next/link";

import { CodeSample } from "./code-sample";
import { secondaryCta } from "./cta";

const REQUEST = `curl "$GATEWAY_URL/v1/chat/completions" \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'`;

export function QuickStart() {
  return (
    <section className="border-b border-border" id="quickstart">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="section-kicker">03 / Connect once</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            Your next model.
            <br />
            <span className="text-accent">Same workflow.</span>
          </h2>
          <ol className="mt-6 space-y-4 text-sm leading-6 text-muted">
            <li className="flex gap-3">
              <span className="step-number">1</span>
              <span>
                Create an account and open the customer console. No card is
                required to start.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="step-number">2</span>
              <span>
                Create a key for your project and choose a model from the
                catalog. Paid models use prepaid credit.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="step-number">3</span>
              <span>
                Send the request. Streaming is a boolean in the same body; set
                it to <code className="mono text-foreground">false</code> for a
                single JSON response.
              </span>
            </li>
          </ol>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link className={secondaryCta} href="/models">
              Browse the catalog
            </Link>
            <Link
              className="text-xs text-muted transition-colors hover:text-foreground"
              href="/docs/start"
            >
              New here? Read the newcomer guide
              <i aria-hidden className="fa-solid fa-arrow-right ml-2" />
            </Link>
          </div>
        </div>

        <CodeSample code={REQUEST} label="Request" />
      </div>
    </section>
  );
}
