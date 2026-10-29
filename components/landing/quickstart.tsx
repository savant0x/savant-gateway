import Link from "next/link";

import { CodeSample } from "./code-sample";
import { secondaryCta } from "./cta";

const REQUEST = `curl http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"free/gpt-6-luna","messages":[{"role":"user","content":"Hello"}]}'`;

export function QuickStart() {
  return (
    <section
      className="border-y border-white/10 bg-white/[0.02]"
      id="quickstart"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            Quick start
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            Point it at the provider, then call it.
          </h2>
          <ol className="mt-6 space-y-4 text-sm leading-6 text-muted">
            <li className="flex gap-3">
              <span className="step-number">1</span>
              <span>
                Put <code className="mono text-foreground">PROVIDER_KEY</code>{" "}
                in <code className="mono text-foreground">.env.local</code> and
                start the app.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="step-number">2</span>
              <span>
                Open the console, sync the provider, and create a consumer key.
                Copy the secret from the one-time panel.
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
          <Link className={`${secondaryCta} mt-7`} href="/dashboard">
            Open the console
          </Link>
        </div>

        <CodeSample code={REQUEST} label="Request" />
      </div>
    </section>
  );
}
