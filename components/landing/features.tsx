const FEATURES = [
  {
    icon: "fa-layer-group",
    title: "Full catalog routing",
    body: "Every active model is catalogued behind one endpoint. Free rows route immediately; a non-free row routes once the operator sets its sell price.",
  },
  {
    icon: "fa-calculator",
    title: "Price and margin math",
    body: "Cost and sell price are separate integer columns. Admin edits sell prices inline and sees per-direction margin and blended profit.",
  },
  {
    icon: "fa-wallet",
    title: "Credit settlement",
    body: "Paid calls reserve a hold against the tenant balance, then settle actual usage. Free calls never touch credit.",
  },
  {
    icon: "fa-chart-line",
    title: "Revenue analytics",
    body: "Revenue, upstream cost, gross margin, latency, error rate, daily series, and top models come from the same usage rows.",
  },
  {
    icon: "fa-key",
    title: "Hashed consumer keys",
    body: "SHA-256 at rest. The plaintext secret exists only in the creation response and never in a log or database column.",
  },
  {
    icon: "fa-tower-broadcast",
    title: "Streaming passthrough",
    body: "Server-sent events are forwarded as they arrive, with usage captured from the final frame or estimated when the provider omits it.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            Scope
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            A provider, not a proxy demo.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            Catalog, pricing, credit, routing, metering, and analytics are one
            system. Every number on the public site is enforced by the gateway.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <i
                  aria-hidden
                  className={`fa-solid ${feature.icon} text-xs text-cyan-300`}
                />
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
