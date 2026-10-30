/**
 * Runs once when a Next.js server starts. A production process that cannot
 * honour the storage/capacity contract must not begin serving: returning a
 * healthy-looking response from a temporary database or a second worker is
 * worse than a failed start. The build phase is skipped because it does not
 * serve traffic and does not receive the deployment's runtime environment.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { validateProductionConfig } =
    await import("./lib/production-config.ts");
  const config = validateProductionConfig(process.env);

  if (config.ok) return;

  const codes = config.issues.map((entry) => entry.code).join(", ");

  // Codes only. The validator never includes a configured value.
  // eslint-disable-next-line no-console
  console.error(`[startup] production configuration rejected: ${codes}`);

  throw new Error(
    "Production configuration is not ready. Run `npm run config:check` for the list.",
  );
}
