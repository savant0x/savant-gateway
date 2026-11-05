/**
 * TLS policy for the disposable-database provisioning helpers.
 *
 * Remote hosts are always certificate-verified. A managed provider CA can be
 * supplied inline or by file; without one, the platform trust store is used and
 * an untrusted certificate is refused. Only a loopback host may skip TLS or use
 * an unverified local certificate, because no network boundary is crossed.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UNVERIFIED_MODES = new Set(["no-verify", "allow", "prefer"]);

export function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname ?? "").toLowerCase());
}

function readCa(env) {
  const inline = env.PROVISIONING_DATABASE_CA?.trim();
  const file = env.PROVISIONING_DATABASE_CA_FILE?.trim();

  if (inline && file) {
    throw new Error(
      "Set only one of PROVISIONING_DATABASE_CA or PROVISIONING_DATABASE_CA_FILE.",
    );
  }

  if (!file) return inline || undefined;

  try {
    return readFileSync(resolve(file), "utf8");
  } catch {
    throw new Error("PROVISIONING_DATABASE_CA_FILE could not be read.");
  }
}

/**
 * Returns the `ssl` option for a provisioning connection.
 *
 * A remote `sslmode=disable` or an unverified mode is refused rather than
 * silently downgraded. `sslmode=require` still verifies the certificate and
 * hostname because the explicit `rejectUnauthorized: true` wins over the URL's
 * libpq-compatible parser settings.
 */
export function provisioningSslConfig(url, options = {}) {
  const host = String(url?.hostname ?? "").toLowerCase();

  if (!host) {
    throw new Error("A provisioning connection URL must name a host.");
  }

  const mode = url.searchParams.get("sslmode");
  const loopback = isLoopbackHost(host);

  if (mode === "disable") {
    if (loopback) return undefined;

    throw new Error(
      "sslmode=disable is refused for a remote provisioning host; use verify-full or supply a CA.",
    );
  }

  if (!loopback && UNVERIFIED_MODES.has(mode)) {
    throw new Error(
      "Unverified TLS modes are refused for a remote provisioning host; use verify-full or supply a CA.",
    );
  }

  if (loopback && mode === null) return undefined;

  const ca = options.ca ?? readCa(options.env ?? process.env);

  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}
