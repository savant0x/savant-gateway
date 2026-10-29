const FEATURES = [
  {
    title: "Hashed consumer keys",
    body: "SHA-256 at rest. The plaintext secret exists only in the creation response and never in a log or database column.",
  },
  {
    title: "Streaming passthrough",
    body: "Server-sent events are forwarded as they arrive, including a final usage frame when the provider sends one.",
  },
  {
    title: "Weighted metering",
    body: "Raw input/output tokens and the provider's weighted units are stored separately, so a 3× model is visible as 3×.",
  },
  {
    title: "Local-first storage",
    body: "SQLite holds the catalog, keys, provider state, and usage. Delete the database and sync again to reset the catalog.",
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
            Thin by design.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            No billing stubs, no account theatre, no reseller dashboard. The
            gateway does four things and says so.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <h3 className="text-sm font-semibold">{feature.title}</h3>
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
