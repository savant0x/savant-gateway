import { validateProductionConfig } from "../lib/production-config.ts";

// The default check is safe for development and is the form `npm run verify`
// runs. `--production` is the operator gate: it holds an unspecified
// NODE_ENV to the same inventory a production start requires.
if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

const result = validateProductionConfig(process.env);

if (result.ok) {
  const label =
    process.env.NODE_ENV !== "production"
      ? " (non-production)"
      : result.disposable
        ? " (disposable start)"
        : ` (${result.origin})`;

  console.log(`config-check: PASS${label}`);

  process.exit(0);
}

for (const issue of result.issues) {
  console.error(`config-check: ${issue.code} — ${issue.message}`);
}

process.exit(1);
