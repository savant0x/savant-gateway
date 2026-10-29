const STEPS = [
  {
    title: "Create an account",
    body: "Sign up with your email and password. Create separate API keys for your projects and revoke them from your account when needed.",
  },
  {
    title: "Add prepaid credit",
    body: "Paid models use prepaid credit at the published input and output rates. Top-ups become available once payments are configured for this deployment.",
  },
  {
    title: "Call any model",
    body: "Send requests through the OpenAI-compatible endpoint. Review your recorded usage and charges from your account.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-border bg-surface" id="how-it-works">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
          The path
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">
          From account to first request.
        </h2>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-border py-6 pr-6">
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
