/**
 * One redaction policy for everything the gateway writes down or returns.
 *
 * A configured upstream can echo the credential it was sent inside an error
 * body. Sanitising the public response is not enough: the same text can reach
 * `usage_events.error`, a provider runtime row, a benchmark attempt, or the
 * server log. Redact at those boundaries with one function so there is a single
 * definition of what a secret looks like.
 *
 * Two rules apply in order: every configured secret value is removed literally,
 * then token-shaped text is removed by pattern. A value shorter than
 * `MIN_SECRET_LENGTH` is not treated as a secret: redacting every occurrence of
 * a short string would corrupt ordinary diagnostics without protecting anything.
 */

export const REDACTED = "[redacted]";

const MIN_SECRET_LENGTH = 8;

/** Environment names whose values are credentials, e.g. `PROVIDER_KEY`. */
const SECRET_NAME =
  /(?:^|_)(?:KEY|KEYS|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASS|CREDENTIAL|CREDENTIALS|AUTH)(?:_|$)/i;

type TextRule = {
  pattern: RegExp;
  render: (match: string, groups: readonly unknown[]) => string;
};

function group(groups: readonly unknown[], index: number) {
  const value = groups[index];

  return typeof value === "string" ? value : "";
}

const TEXT_RULES: TextRule[] = [
  {
    pattern: /\bsk-[A-Za-z0-9_-]{8,}/g,
    render: () => REDACTED,
  },
  {
    pattern: /\bwhsec_[A-Za-z0-9_]{8,}/g,
    render: () => REDACTED,
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    render: () => `Bearer ${REDACTED}`,
  },
  {
    pattern:
      /\b(api[_-]?key|access[_-]?token|secret|password)\b(\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{8,})/gi,
    render: (_match, groups) =>
      `${group(groups, 0)}${group(groups, 1)}${REDACTED}`,
  },
];

/**
 * Values of configured secret-named variables, longest first so a secret that
 * contains another one is removed whole rather than in pieces.
 */
export function configuredSecrets(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const values = new Set<string>();

  for (const [name, raw] of Object.entries(env)) {
    if (!raw || !SECRET_NAME.test(name)) continue;

    const value = raw.trim();

    if (value.length < MIN_SECRET_LENGTH || value === REDACTED) continue;

    values.add(value);
  }

  return Array.from(values).sort((left, right) => right.length - left.length);
}

/** Removes configured credential values and token-shaped text from a value. */
export function redactSecrets(
  value: unknown,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  let text: string;

  if (typeof value === "string") {
    text = value;
  } else if (value instanceof Error) {
    text = value.stack ?? value.message;
  } else {
    text = String(value);
  }

  for (const secret of configuredSecrets(env)) {
    text = text.split(secret).join(REDACTED);
  }

  for (const rule of TEXT_RULES) {
    text = text.replace(rule.pattern, (match: string, ...groups: unknown[]) =>
      rule.render(match, groups),
    );
  }

  return text;
}
