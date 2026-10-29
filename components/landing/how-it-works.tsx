const STEPS = [
  {
    title: "Sync the upstream catalog",
    body: "The server reads the provider key, records balance and subscription state, and imports every model with its cost, capabilities, and access tier.",
  },
  {
    title: "Set sell prices",
    body: "A default markup prices the catalog. Admin edits individual rows or reapplies a markup, with margin and blended profit computed from the same integers the gateway charges.",
  },
  {
    title: "Call any model",
    body: "Mint a consumer key and fund the tenant credit. Free models stream immediately; paid models reserve a hold, settle actual usage, and write revenue and cost to analytics.",
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
          Three steps from provider key to a billed completion.
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
