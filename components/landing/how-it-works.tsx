const STEPS = [
  {
    title: "Sync the upstream catalog",
    body: "The server reads the provider key, records balance and subscription state, and imports every model with its real free/paid signal.",
  },
  {
    title: "Mint a consumer key",
    body: "Keys are generated locally and stored only as SHA-256 hashes. The full sk-… secret is returned once, at creation.",
  },
  {
    title: "Call the OpenAI endpoint",
    body: "Route requests through /v1/chat/completions. Free models stream or return JSON; paid models are rejected before upstream spend.",
  },
];

export function HowItWorks() {
  return (
    <section
      className="border-y border-white/10 bg-white/[0.02]"
      id="how-it-works"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
          The path
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">
          Three steps from provider key to a live completion.
        </h2>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-white/10 bg-[#050b12] p-6"
            >
              <span className="step-number">{index + 1}</span>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
