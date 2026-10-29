import { Card } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";

import { AuthForm } from "./auth-form";

import { siteConfig } from "@/config/site";

const COPY = {
  signup: {
    eyebrow: "Pay as you go",
    title: "One key. The full catalog.",
    body: "Create an account, mint a gateway key, and call paid models with prepaid credit. Free-pool models work with a balance of zero.",
    bullets: [
      "Full provider catalog, including paid and subscription-only models",
      "Prepaid credit — top up only what you plan to spend",
      "Usage and charges recorded per request",
      "Keys are hashed; revoke any key instantly",
    ],
  },
  login: {
    eyebrow: "Customer console",
    title: "Welcome back.",
    body: "Sign in to see your balance, manage keys, review usage, and add credit.",
    bullets: [
      "Server-side sessions, revocable on sign-out",
      "Per-account keys and usage — never shared",
      "Stripe-hosted checkout; card data never touches this app",
      "No subscription or minimum spend",
    ],
  },
} as const;

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const copy = COPY[mode];

  return (
    <div className="flex min-h-screen flex-col bg-[#050b12] text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link className="flex items-center gap-3" href="/">
            <Image
              alt=""
              className="h-9 w-9 rounded-xl ring-1 ring-cyan-300/30"
              height={36}
              src="/logo-32.png"
              width={36}
            />
            <span className="text-sm font-semibold">{siteConfig.name}</span>
          </Link>
          <Link
            className="ml-auto text-sm text-muted transition-colors hover:text-foreground"
            href="/models"
          >
            Browse models
          </Link>
          <Link
            className="text-sm text-muted transition-colors hover:text-foreground"
            href="/"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            {copy.body}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            {copy.bullets.map((bullet) => (
              <li key={bullet}>· {bullet}</li>
            ))}
          </ul>
        </div>

        <Card className="border border-white/10 bg-white/[0.03]">
          <Card.Header>
            <Card.Title>
              {mode === "signup" ? "Create your account" : "Sign in"}
            </Card.Title>
            <Card.Description>
              {mode === "signup"
                ? "No card required to start. Paid models need credit."
                : "Use the email and password you signed up with."}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <AuthForm mode={mode} />
          </Card.Content>
        </Card>
      </main>
    </div>
  );
}
