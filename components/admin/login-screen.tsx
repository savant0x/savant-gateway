import { Card } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "./login-form";

import { siteConfig } from "@/config/site";

const GENERATE_SECRET =
  "node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\"";

export function LoginScreen({
  configured,
  reason,
}: {
  configured: boolean;
  reason: string | null;
}) {
  return (
    <div className="auth-surface flex min-h-screen flex-col text-foreground">
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
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted">
            Admin
          </span>
          <Link
            className="ml-auto text-sm text-muted transition-colors hover:text-foreground"
            href="/"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            Restricted surface
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            Your gateway.
            <br />
            Under control.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            The admin panel is separate from the console. It syncs the full
            upstream catalog, prices every paid row, funds tenant credit, and
            shows the revenue and margin those calls produced.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li>· Password compared in constant time</li>
            <li>· Eight-hour signed session, rotated with the password</li>
            <li>· Five failed attempts per client, then a ten-minute pause</li>
            <li>· Every pricing and credit mutation is same-origin checked</li>
          </ul>
        </div>

        <Card className="border border-white/10 bg-white/[0.03]">
          <Card.Header>
            <Card.Title>Sign in</Card.Title>
            <Card.Description>
              {configured
                ? "Use the password from .env.local."
                : "Admin access is not configured on this server."}
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4">
            {configured ? (
              <LoginForm />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                  {reason ?? "Set the admin credentials to continue."}
                </p>
                <p className="text-muted">
                  Add both values to{" "}
                  <code className="mono text-foreground">.env.local</code>, then
                  restart the server:
                </p>
                <pre className="scroll-shell rounded-xl bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
                  <code>{`ADMIN_PASSWORD=<12+ characters>
ADMIN_SESSION_SECRET=<32+ characters>`}</code>
                </pre>
                <pre className="scroll-shell rounded-xl bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
                  <code>{GENERATE_SECRET}</code>
                </pre>
                <p className="text-xs text-muted">
                  The password is never stored in the repository. Rotating it
                  invalidates every existing session.
                </p>
              </div>
            )}
          </Card.Content>
        </Card>
      </main>
    </div>
  );
}
