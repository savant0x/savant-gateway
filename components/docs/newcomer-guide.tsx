import Link from "next/link";

import { DocsPage } from "./docs-page";

import { CodeSample } from "@/components/landing/code-sample";
import { primaryCta, secondaryCta } from "@/components/landing/cta";

const ENVIRONMENT = `export GATEWAY_URL="http://localhost:3000"
export SAVANT_API_KEY="sk-..."`;

const LIST_MODELS = `curl "$GATEWAY_URL/v1/models" \\
  -H "Authorization: Bearer $SAVANT_API_KEY"`;

const FIRST_CALL = `curl "$GATEWAY_URL/v1/chat/completions" \\
  -H "Authorization: Bearer $SAVANT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "YOUR_MODEL_ID",
    "messages": [{ "role": "user", "content": "Hello from my first call." }],
    "max_tokens": 256
  }'`;

const PYTHON_CALL = `from openai import OpenAI
import os

client = OpenAI(
    base_url=f"{os.environ['GATEWAY_URL']}/v1",
    api_key=os.environ["SAVANT_API_KEY"],
)

response = client.chat.completions.create(
    model="YOUR_MODEL_ID",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=256,
)

print(response.choices[0].message.content)`;

const JAVASCRIPT_STREAM = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: \`\${process.env.GATEWAY_URL}/v1\`,
  apiKey: process.env.SAVANT_API_KEY,
});

async function main() {
  const stream = await client.chat.completions.create({
    model: "YOUR_MODEL_ID",
    messages: [{ role: "user", content: "Hello" }],
    max_tokens: 256,
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  }
}

main();`;

const REQUEST_ERRORS = [
  {
    status: "401",
    meaning: "Missing or invalid API key.",
    next: "Send Bearer or x-api-key with an active account key.",
  },
  {
    status: "402",
    meaning: "Credit or allowance cannot cover the request.",
    next: "Check the account page, or choose a free-pool model.",
  },
  {
    status: "403",
    meaning: "The model needs a subscription that includes it.",
    next: "Choose a free or paid row instead.",
  },
  {
    status: "404",
    meaning: "The model id is not in the public catalog.",
    next: "Call /v1/models and use an id from that response.",
  },
  {
    status: "429",
    meaning: "A rate limit is active.",
    next: "Read Retry-After and wait; free traffic shares one bucket.",
  },
  {
    status: "502",
    meaning: "The upstream provider failed or returned an invalid response.",
    next: "Retry, or choose another model. There is no automatic failover.",
  },
  {
    status: "503",
    meaning:
      "The model is unpriced, disabled, or the shared pool is unavailable.",
    next: "Read the error type, then retry or choose another row.",
  },
] as const;

function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-24 space-y-4" id={id}>
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
      {children}
    </section>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-muted">
      <i
        aria-hidden
        className="fa-solid fa-check mt-1 text-[11px] text-emerald-300"
      />
      <span>{children}</span>
    </li>
  );
}

export function NewcomerGuide() {
  return (
    <DocsPage
      active="start"
      description="You do not need to learn a new API to use the gateway. Create one account, pick a model by its billing group, and send an OpenAI-shaped request. This page is the shortest path from zero to a real response."
      eyebrow="Newcomer guide"
      title="Your first request, without the folklore."
    >
      <div className="space-y-12">
        <section className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.03] to-transparent p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            The short version
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Savant Gateway is one OpenAI-compatible endpoint over several model
            families. You bring an account key; the gateway resolves the public
            model id to its provider, applies the billing group, and settles the
            call. You do not manage upstream provider accounts or credentials.
          </p>
          <ul className="mt-5 space-y-2">
            <CheckItem>
              One account and one balance across the catalog.
            </CheckItem>
            <CheckItem>
              One key shape:{" "}
              <code className="mono text-foreground">Bearer</code> or{" "}
              <code className="mono text-foreground">x-api-key</code>.
            </CheckItem>
            <CheckItem>
              Chat Completions only; native provider APIs are not exposed.
            </CheckItem>
          </ul>
        </section>

        <GuideSection id="account" title="1. Create an account and a key">
          <p className="text-sm leading-7 text-muted">
            Sign up, accept the current policies, then open your account page.
            Create a key there. The full secret is shown once; only its hash is
            stored after that. Keys are account-scoped, so a key from one
            account cannot read or revoke another account&apos;s key.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className={primaryCta} href="/signup">
              Create an account
            </Link>
            <Link className={secondaryCta} href="/account">
              Open your account
            </Link>
          </div>
        </GuideSection>

        <GuideSection id="model" title="2. Pick a model by billing group">
          <p className="text-sm leading-7 text-muted">
            Open the live catalog at{" "}
            <Link className="text-accent hover:underline" href="/models">
              /models
            </Link>
            , or call{" "}
            <code className="mono text-foreground">GET /v1/models</code>. Every
            row carries a <code className="mono text-foreground">group</code>{" "}
            and sell prices for input and output tokens. Read the group before
            you budget.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Free pool",
                body: "Zero charge. Metered in weighted tokens against a shared daily pool. Your account page shows the current allowance and reset time.",
              },
              {
                title: "Paid",
                body: "Debits prepaid credit at the listed sell price after the request settles. A hold is reserved before dispatch.",
              },
              {
                title: "Subscription",
                body: "Covered by a purchased plan snapshot. Plans are not on sale during this launch; an existing comped plan still works.",
              },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="text-sm font-semibold">{group.title}</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {group.body}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs leading-6 text-muted">
            A paid row with no sell price is unavailable, not free. A model that
            vanished upstream is delisted from the public catalog instead of
            being deleted, so its history stays intact.
          </p>
        </GuideSection>

        <GuideSection id="request" title="3. Send the request">
          <p className="text-sm leading-7 text-muted">
            For a local checkout,{" "}
            <code className="mono text-foreground">GATEWAY_URL</code> is{" "}
            <code className="mono text-foreground">http://localhost:3000</code>.
            For a hosted deployment, use its public origin without a trailing
            slash. Set{" "}
            <code className="mono text-foreground">SAVANT_API_KEY</code> to the
            key you created. Read the model list first; the examples
            deliberately use a placeholder id.
          </p>

          <CodeSample code={ENVIRONMENT} label="Shell environment" />
          <CodeSample code={LIST_MODELS} label="List visible models" />
          <CodeSample code={FIRST_CALL} label="First completion" />
          <CodeSample
            code={PYTHON_CALL}
            label="The same call with the OpenAI Python SDK"
          />
          <CodeSample
            code={JAVASCRIPT_STREAM}
            label="Streaming with the OpenAI JavaScript SDK"
          />

          <p className="text-xs leading-6 text-muted">
            The SDK examples require the OpenAI client ({" "}
            <code className="mono text-foreground">pip install openai</code> or{" "}
            <code className="mono text-foreground">npm install openai</code>).
            Both set the base URL to the gateway origin plus{" "}
            <code className="mono text-foreground">/v1</code>. The JavaScript
            example streams chunks; omit{" "}
            <code className="mono text-foreground">stream: true</code> to await
            one JSON response. Server-sent events end with{" "}
            <code className="mono text-foreground">data: [DONE]</code>.
          </p>
        </GuideSection>

        <GuideSection
          id="billing"
          title="4. Understand what the first call costs"
        >
          <p className="text-sm leading-7 text-muted">
            Free-pool calls never debit credit. A paid call reserves an
            estimated hold before dispatch, then one settlement transaction
            releases the hold and debits the actual charge. Available credit is
            the balance minus holds, so it can be lower than the balance while
            calls are in flight.
          </p>
          <p className="text-sm leading-7 text-muted">
            A hold is admission control, not a ceiling. If the provider reports
            more usage than the estimate, the debit can push the balance below
            zero; the next paid call is refused with{" "}
            <code className="mono text-foreground">402</code> until the account
            is funded. The account page shows the balance, usage rows and ledger
            rather than a single inferred number.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className={secondaryCta} href="/account">
              See balance and usage
            </Link>
            <Link className={secondaryCta} href="/refunds">
              Read the refund policy
            </Link>
          </div>
        </GuideSection>

        <GuideSection id="errors" title="5. If the first call fails">
          <div className="scroll-shell rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Usually means</th>
                  <th>What to try</th>
                </tr>
              </thead>
              <tbody>
                {REQUEST_ERRORS.map((row) => (
                  <tr key={row.status}>
                    <td className="mono whitespace-nowrap text-xs text-cyan-200">
                      {row.status}
                    </td>
                    <td className="text-sm leading-6 text-muted">
                      {row.meaning}
                    </td>
                    <td className="text-sm leading-6 text-muted">{row.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-6 text-muted">
            The{" "}
            <Link className="text-accent hover:underline" href="/docs#errors">
              API reference
            </Link>{" "}
            lists the full error envelope, and the{" "}
            <Link className="text-accent hover:underline" href="/docs/faq">
              FAQ
            </Link>{" "}
            covers the questions that usually come before the first request.
          </p>
        </GuideSection>

        <GuideSection id="next" title="6. Where to go next">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/docs",
                title: "API reference",
                body: "Every request field, model field and error status.",
              },
              {
                href: "/docs/faq",
                title: "FAQ",
                body: "Billing, access, limits, streaming and account questions.",
              },
              {
                href: "/models",
                title: "Live catalog",
                body: "Current models, billing groups and per-million-token prices.",
              },
              {
                href: "/support",
                title: "Support",
                body: "Account-bound help when the docs do not answer it.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan-300/30"
                href={item.href}
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{item.body}</p>
              </Link>
            ))}
          </div>
        </GuideSection>
      </div>
    </DocsPage>
  );
}
