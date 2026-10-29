const STEPS = [
  {
    title: "Create an account",
    body: "Sign up with email and password. Sessions are opaque, server-side, and revocable — no shared keys and no operator access to your account.",
  },
  {
    title: "Add prepaid credit",
    body: "Top up $5–$500 through Stripe Checkout. Credit is added only after the signed webhook confirms payment, and every balance change is ledgered.",
  },
  {
    title: "Call any model",
    body: "Mint a gateway key and call the full catalog. Free models stream immediately; paid models reserve a hold, settle actual usage, and debit your available credit.",
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
          Three steps from signup to a billed completion.
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
