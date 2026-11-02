import Link from "next/link";

export function ContentDisabled() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
        Signal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
        Content is not enabled
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        The operator has disabled the content surface for this deployment. Model
        pricing and the gateway are unaffected. Set{" "}
        <code className="mono text-foreground">CONTENT_ENABLED=true</code> to
        enable it.
      </p>
      <Link
        className="mt-5 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        href="/models"
      >
        Browse models
      </Link>
    </section>
  );
}
