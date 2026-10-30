import { validateProductionConfig } from "../lib/production-config.ts";

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
