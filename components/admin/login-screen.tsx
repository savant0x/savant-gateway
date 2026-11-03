import type { AdminDiagnostics } from "@/lib/admin-diagnostics";

import { Card } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "./login-form";

import { brandImages } from "@/config/images";
import { siteConfig } from "@/config/site";

const GENERATE_SECRET =
  "node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\"";

function bandLabel(band: AdminDiagnostics["password"]) {
  if (band === "valid") return "valid";
  if (band === "too_short") return "present, below minimum";

  return "missing";
}

function bandDetail(band: AdminDiagnostics["password"], whitespace: boolean) {
  return `${bandLabel(band)}${whitespace ? " (surrounding whitespace)" : ""}`;
}

function databaseLabel(value: AdminDiagnostics["databaseReachable"]) {
  if (value === null) return "not checked";

  return value ? "reachable" : "unavailable";
}

function Diagnostics({ data }: { data: AdminDiagnostics }) {
  return (
    <details className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted">
      <summary className="cursor-pointer select-none font-medium text-foreground">
        Environment diagnostics
      </summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt>Runtime</dt>
        <dd className="mono text-foreground">{data.runtime}</dd>
        <dt>Password</dt>
        <dd className="mono text-foreground">
          {bandDetail(data.password, data.passwordWhitespace)}
        </dd>
        <dt>Session secret</dt>
        <dd className="mono text-foreground">
          {bandDetail(data.sessionSecret, data.sessionSecretWhitespace)}
        </dd>
        <dt>Database</dt>
        <dd className="mono text-foreground">
          {databaseLabel(data.databaseReachable)}
        </dd>
        <dt>Public origin</dt>
        <dd className="mono break-all text-foreground">
          {data.origin ?? "not configured"}
          {data.origin && !data.originValid ? " (invalid)" : ""}
        </dd>
        <dt>Production config</dt>
        <dd className="mono text-foreground">
          {data.productionConfigValid === null
            ? "not evaluated outside production"
            : data.productionConfigValid
              ? "valid"
              : "invalid"}
        </dd>
      </dl>
      {data.passwordWhitespace || data.sessionSecretWhitespace ? (
        <p className="mt-2 break-words text-warning">
          An admin value has leading or trailing whitespace. Remove it in the
          host&apos;s environment settings and redeploy; a typed password cannot
          match a value copied with a newline.
        </p>
      ) : null}
      {data.databaseReachable === false ? (
        <p className="mt-2 break-words text-warning">
          The session epoch could not be read. Check DATABASE_URL and /api/ready
          before rotating the password.
        </p>
      ) : null}
      {data.issueCodes.length > 0 ? (
        <p className="mt-2 break-words text-warning">
          Issues: {data.issueCodes.join(", ")}
        </p>
      ) : null}
      {data.reason ? <p className="mt-2">{data.reason}</p> : null}
      <p className="mt-2">
        Values and derived secrets are never shown. Lengths are reported only as
        valid, too short, or missing.
      </p>
    </details>
  );
}

export function LoginScreen({
  configured,
  databaseReachable,
  diagnostics,
  notice,
  reason,
  returnTo,
}: {
  configured: boolean;
  databaseReachable: boolean | null;
  diagnostics: AdminDiagnostics;
  notice: boolean;
  reason: string | null;
  returnTo: string | null;
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
              src={brandImages.logoSmall}
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
                ? notice
                  ? "Your admin session is missing or has ended. Sign in to continue."
                  : "Use the password from .env.local."
                : "Admin access is not configured on this server."}
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4">
            {configured && databaseReachable === false ? (
              <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                Admin credentials are configured, but the database that holds
                the session epoch is unreachable. Sign-in cannot issue a session
                until `/api/ready` is healthy.
              </p>
            ) : null}
            {configured ? (
              <LoginForm returnTo={returnTo} />
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
          <Card.Footer className="block">
            <Diagnostics data={diagnostics} />
          </Card.Footer>
        </Card>
      </main>
    </div>
  );
}
