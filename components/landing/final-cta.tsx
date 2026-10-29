import Image from "next/image";
import Link from "next/link";

import { primaryCta, secondaryCta } from "./cta";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.03] to-transparent px-6 py-14 sm:px-12">
        <Image
          aria-hidden
          alt=""
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 opacity-20 blur-[1px]"
          height={192}
          src="/logo.png"
          width={192}
        />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Ready to route the whole catalog?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            The console creates keys, funds the tenant, runs a real completion,
            and shows the charged usage row it produced. Admin keeps pricing and
            analytics behind its own password.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className={primaryCta} href="/dashboard">
              Open the console
            </Link>
            <Link className={secondaryCta} href="/admin">
              Admin sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
