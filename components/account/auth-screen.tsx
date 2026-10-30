import { Card } from "@heroui/react";
import Image from "next/image";

import { AuthForm } from "./auth-form";

import { SiteHeader } from "@/components/landing/site-header";
import { brandImages } from "@/config/images";

const COPY = {
  signup: {
    eyebrow: "Your connection to Savant",
    title: "More possibilities. One account.",
    body: "Compare model prices, create keys for your projects, and keep your usage in view.",
    bullets: [
      "Choose from the complete enabled catalog",
      "Separate keys for every project",
      "Review your recorded usage and charges",
    ],
  },
  login: {
    eyebrow: "Customer workspace",
    title: "Pick up where you left off.",
    body: "Your balance, project keys, and usage are waiting in your account.",
    bullets: [
      "Manage and revoke your project keys",
      "Explore model pricing and access",
      "Review balance and billing history",
    ],
  },
} as const;

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const copy = COPY[mode];

  return (
    <div className="auth-surface flex min-h-screen flex-col text-foreground">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-24">
        <div>
          <p className="section-kicker">{copy.eyebrow}</p>
          <h1 className="mt-5">{copy.title}</h1>
          <p className="mt-5 max-w-md text-xl leading-8 text-muted">
            {copy.body}
          </p>
          <ul className="mt-8 space-y-4 text-base text-muted">
            {copy.bullets.map((bullet) => (
              <li key={bullet}>
                <i
                  aria-hidden
                  className="fa-solid fa-check mr-3 text-xs text-accent"
                />
                {bullet}
              </li>
            ))}
          </ul>
          <div
            aria-hidden
            className="mt-10 hidden items-center gap-4 border-t border-border pt-6 lg:flex"
          >
            <Image
              alt=""
              className="h-16 w-16 object-contain"
              height={64}
              src={brandImages.logo}
              width={64}
            />
            <span className="font-mono text-[10px] tracking-widest text-muted">
              SAVANT ECOSYSTEM{" "}
              <span className="text-accent">{"// GATEWAY"}</span>
            </span>
          </div>
        </div>
        <Card>
          <Card.Header>
            <Card.Title>
              {mode === "signup" ? "Create your account" : "Sign in"}
            </Card.Title>
            <Card.Description>
              {mode === "signup"
                ? "Start with your email and password."
                : "Use the details you signed up with."}
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
