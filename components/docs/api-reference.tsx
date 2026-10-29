import Link from "next/link";

import {
  CHAT_REQUEST,
  CHAT_RESPONSE,
  ERROR_RESPONSE,
  ERRORS,
  type Field,
  GROUPS,
  IDENTITIES,
  MODEL_FIELDS,
  MODELS_REQUEST,
  MODELS_RESPONSE,
  NAV_ITEMS,
  REQUEST_FIELDS,
} from "./api-reference-data";

import { CodeSample } from "@/components/landing/code-sample";
import { primaryCta, secondaryCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

function FieldTable({ fields }: { fields: readonly Field[] }) {
  return (
    <div className="scroll-shell rounded-2xl border border-white/10 bg-white/[0.02]">
      <table className="data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Meaning</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <td className="whitespace-nowrap">
                <code className="mono text-xs text-cyan-200">{field.name}</code>
              </td>
              <td className="whitespace-nowrap text-xs text-muted">
                {field.type}
              </td>
              <td className="max-w-[30rem] text-sm leading-6 text-muted">
                {field.description}
              </td>
              <td className="mono whitespace-nowrap text-xs text-foreground">
                {field.example}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="scroll-mt-24" id={id}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          {children}
        </p>
      ) : null}
    </div>
  );
}

export function ApiReference() {
  return (
    <div className="min-h-screen bg-[#050b12] text-slate-100">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Integration reference
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              The API is the catalog.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Savant Gateway exposes an OpenAI-compatible surface. Read the
              model object to choose a row, then send its id to the chat
              endpoint. All paths below are relative to your deployment origin;{" "}
              <code className="mono text-foreground">$GATEWAY_URL</code> stands
              for that origin in the examples.
            </p>

            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              {["OpenAI-compatible", "Bearer key", "JSON + SSE"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link className={primaryCta} href="/signup">
                Create an account
              </Link>
              <Link className={secondaryCta} href="/models">
                Browse live models
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:px-8">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 border-l border-white/10 pl-4 text-sm">
              <p className="pb-2 text-[10px] uppercase tracking-[0.18em] text-muted">
                On this page
              </p>
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  className="block rounded-r-lg py-1.5 text-muted transition-colors hover:text-foreground"
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-14">
            <section className="space-y-5">
              <SectionHeading
                eyebrow="Vocabulary"
                id="identity"
                title="Provider, family, and price group are different things"
              >
                The model object carries all three. They are not
                interchangeable, and a consumer should never derive one from
                another.
              </SectionHeading>

              <div className="grid gap-3 md:grid-cols-3">
                {IDENTITIES.map((identity) => (
                  <article
                    key={identity.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
                      {identity.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-cyan-200">
                      {identity.value}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted">
                      {identity.detail}
                    </p>
                  </article>
                ))}
              </div>

              <div className="scroll-shell rounded-2xl border border-white/10 bg-white/[0.02]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Billing</th>
                      <th>Routing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map((row) => (
                      <tr key={row.group}>
                        <td className="whitespace-nowrap">
                          <code className="mono text-xs text-cyan-200">
                            {row.group}
                          </code>
                        </td>
                        <td className="max-w-[24rem] text-sm leading-6 text-muted">
                          {row.billing}
                        </td>
                        <td className="max-w-[24rem] text-sm leading-6 text-muted">
                          {row.routing}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeading
                eyebrow="Authentication"
                id="authentication"
                title="One account key, two accepted headers"
              >
                Create a key on your account page. Keys are account-scoped,
                hashed at rest, and revoked immediately. Send either a bearer
                token or x-api-key on every /v1 request.
              </SectionHeading>

              <CodeSample code={MODELS_REQUEST} label="Bearer authentication" />

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-muted">
                <p>
                  <code className="mono text-foreground">
                    x-api-key: sk-...
                  </code>{" "}
                  is accepted as an alternative. A missing key returns{" "}
                  <code className="mono text-foreground">401</code> with type{" "}
                  <code className="mono text-foreground">
                    authentication_error
                  </code>
                  .
                </p>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeading
                eyebrow="GET /v1/models"
                id="models"
                title="List the catalog"
              >
                Returns every active, in-catalog model visible to consumers.
                Prices are our sell prices in USD per 1M tokens; upstream cost
                is never included.
              </SectionHeading>

              <CodeSample code={MODELS_REQUEST} label="Request" />
              <CodeSample code={MODELS_RESPONSE} label="Response · example" />

              <p className="text-xs leading-6 text-muted">
                Example values come from the current local catalog. Call the
                endpoint for live names, prices, and availability.
              </p>
            </section>

            <section className="space-y-5">
              <SectionHeading
                eyebrow="Model object"
                id="model-fields"
                title="Every field, and what it does not mean"
              >
                Use id for requests, family for presentation and filtering, and
                group for billing and access decisions.
              </SectionHeading>

              <FieldTable fields={MODEL_FIELDS} />
            </section>

            <section className="space-y-5">
              <SectionHeading
                eyebrow="POST /v1/chat/completions"
                id="chat"
                title="Send the model id and messages"
              >
                Body fields follow the OpenAI chat-completions shape. The
                gateway substitutes the upstream model id, applies paid-call
                credit admission, and streams the provider response back.
              </SectionHeading>

              <FieldTable fields={REQUEST_FIELDS} />

              <CodeSample code={CHAT_REQUEST} label="Request" />
              <CodeSample code={CHAT_RESPONSE} label="Response · example" />

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-muted">
                <p>
                  Set <code className="mono text-foreground">stream: true</code>{" "}
                  for{" "}
                  <code className="mono text-foreground">
                    text/event-stream
                  </code>
                  . Frames use the provider&apos;s OpenAI-style chunk shape and
                  end with{" "}
                  <code className="mono text-foreground">data: [DONE]</code>.
                  Usage is settled after the response or stream closes.
                </p>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeading
                eyebrow="Errors"
                id="errors"
                title="Errors keep the OpenAI envelope"
              >
                A failed request returns a non-2xx status and an error object
                with message, type, param, and code.
              </SectionHeading>

              <div className="scroll-shell rounded-2xl border border-white/10 bg-white/[0.02]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Type</th>
                      <th>Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ERRORS.map((row) => (
                      <tr key={row.status}>
                        <td className="mono text-xs text-cyan-200">
                          {row.status}
                        </td>
                        <td className="whitespace-nowrap text-xs text-muted">
                          {row.type}
                        </td>
                        <td className="max-w-[32rem] text-sm leading-6 text-muted">
                          {row.meaning}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <CodeSample code={ERROR_RESPONSE} label="Error · example" />
            </section>

            <section className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.03] to-transparent p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Ready to call the catalog?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Create an account for a key and prepaid credit, or browse the
                live model table before choosing a route.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className={primaryCta} href="/signup">
                  Get an API key
                </Link>
                <Link className={secondaryCta} href="/models">
                  Browse models
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
