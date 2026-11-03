/**
 * Launch acceptance receipt (FID-2026-1103-127).
 *
 * The automated suite cannot prove a real payment, a funded paid call, a hosted
 * restore, a delivered alert or an approved load envelope. This module validates
 * the operator-authored record of those observations. It never creates an
 * observation, never fills a missing item, and never authorizes release: a
 * receipt passes only when every item is a recorded pass and the operator's
 * explicit go decision names the pinned SHA that is running.
 */

export const RECEIPT_SCHEMA = 1;

export const ACCEPTANCE_ITEMS = [
  {
    id: "payment",
    label: "Hosted payment and signed webhook",
    detail:
      "A real hosted checkout completed, the provider-signed event was delivered, a replay was refused, and the ledger agrees.",
  },
  {
    id: "inference",
    label: "Funded paid inference",
    detail:
      "Funded JSON and streaming calls succeeded and usage, charge, upstream cost and hold release reconcile.",
  },
  {
    id: "recovery",
    label: "Hosted restore rehearsal",
    detail:
      "A backup was restored into a disposable database and the ledger equation was re-checked.",
  },
  {
    id: "alert",
    label: "Delivered signed alert",
    detail:
      "The monitor delivered a signed alert to the operator destination and an incident was recorded.",
  },
  {
    id: "load",
    label: "Bounded load measurement",
    detail:
      "The approved envelope was measured without unresolved admissions or ledger differences.",
  },
  {
    id: "rollback",
    label: "Drain and rollback rehearsal",
    detail:
      "Admission paused, traffic drained and the previous artifact restored without rewinding financial history.",
  },
] as const;

export type AcceptanceItemId = (typeof ACCEPTANCE_ITEMS)[number]["id"];

export type ReceiptItem = {
  status: "pass" | "fail";
  observedAt: string;
  operator: string;
  evidence: string[];
  notes?: string;
};

export type ReceiptApproval = {
  decision: "go" | "no-go";
  decidedAt: string;
  operator: string;
  sha: string;
  cohort: string;
  spendCapUsd: number;
  statement?: string;
};

export type LaunchReceipt = {
  schema: number;
  pinnedSha: string;
  items: Record<string, ReceiptItem>;
  approval: ReceiptApproval;
};

export type ReceiptVerdict = {
  status: "pass" | "incomplete" | "stale" | "blocked" | "leaked" | "invalid";
  missing: AcceptanceItemId[];
  failed: AcceptanceItemId[];
  leaks: string[];
  reasons: string[];
};

type Env = Readonly<Record<string, string | undefined>>;

const SECRET_ENV_KEYS = [
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "COMMANDCODE_API_KEY",
  "DATABASE_URL",
  "DB_CONNECTION_STRING",
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_IPN_SECRET",
  "PROVIDER_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_API_KEY",
] as const;

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["stripe live key", /sk_live_[A-Za-z0-9]{8,}/],
  ["stripe test key", /sk_test_[A-Za-z0-9]{8,}/],
  ["stripe webhook secret", /whsec_[A-Za-z0-9]{8,}/],
  ["payment address", /[a-z0-9]+:\/\/[^\s:@/]+:[^\s@/]+@/i],
  ["bearer token", /Bearer\s+[A-Za-z0-9._-]{16,}/i],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["api key pair", /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/],
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/** Every string in the receipt, with a dotted path for the failure message. */
function strings(value: unknown, path = "receipt"): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => strings(entry, `${path}[${index}]`));
  }

  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      strings(entry, `${path}.${key}`),
    );
  }

  return [];
}

/**
 * Secret values are matched exactly from the environment plus a small set of
 * unmistakable key prefixes. Paths are reported; values never are.
 */
export function findSecretLeaks(
  receipt: unknown,
  env: Env = process.env,
): string[] {
  const known = SECRET_ENV_KEYS.map((key) => env[key]?.trim() ?? "").filter(
    (value) => value.length >= 8,
  );
  const leaks: string[] = [];

  for (const [path, value] of strings(receipt)) {
    if (known.some((secret) => value.includes(secret))) {
      leaks.push(`${path} contains a configured secret value`);
      continue;
    }

    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        leaks.push(`${path} looks like a ${label}`);
        break;
      }
    }
  }

  return leaks;
}

function readItem(value: unknown, reasons: string[]): ReceiptItem | null {
  if (!isObject(value)) {
    reasons.push("is not an object");
    return null;
  }

  if (value.status !== "pass" && value.status !== "fail") {
    reasons.push("status must be pass or fail");
  }
  if (!validDate(value.observedAt)) reasons.push("observedAt must be a date");
  if (!nonEmptyString(value.operator)) reasons.push("operator is required");
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    !value.evidence.every(nonEmptyString)
  ) {
    reasons.push("evidence must list at least one request id or URL");
  }

  if (reasons.length > 0) return null;

  return {
    status: value.status as ReceiptItem["status"],
    observedAt: value.observedAt as string,
    operator: (value.operator as string).trim(),
    evidence: (value.evidence as string[]).map((entry) => entry.trim()),
    notes: typeof value.notes === "string" ? value.notes : undefined,
  };
}

function readApproval(
  value: unknown,
  reasons: string[],
): ReceiptApproval | null {
  if (!isObject(value)) {
    reasons.push("approval is missing");
    return null;
  }

  if (value.decision !== "go" && value.decision !== "no-go") {
    reasons.push("approval.decision must be go or no-go");
  }
  if (!validDate(value.decidedAt)) reasons.push("approval.decidedAt is required");
  if (!nonEmptyString(value.operator)) reasons.push("approval.operator is required");
  if (!nonEmptyString(value.cohort)) reasons.push("approval.cohort is required");
  if (typeof value.sha !== "string" || !/^[0-9a-f]{40}$/.test(value.sha)) {
    reasons.push("approval.sha must be the full pinned commit SHA");
  }
  if (
    typeof value.spendCapUsd !== "number" ||
    !Number.isFinite(value.spendCapUsd) ||
    value.spendCapUsd < 0
  ) {
    reasons.push("approval.spendCapUsd must be a non-negative number");
  }

  if (reasons.length > 0) return null;

  return {
    decision: value.decision as ReceiptApproval["decision"],
    decidedAt: value.decidedAt as string,
    operator: (value.operator as string).trim(),
    sha: value.sha as string,
    cohort: (value.cohort as string).trim(),
    spendCapUsd: value.spendCapUsd as number,
    statement:
      typeof value.statement === "string" ? value.statement : undefined,
  };
}

/**
 * The verdict is derived, never trusted from the file. A missing, failed or
 * stale item cannot pass; a secret anywhere rejects the receipt outright.
 */
export function evaluateReceipt(
  raw: unknown,
  options: { headSha: string; env?: Env },
): ReceiptVerdict {
  const base: ReceiptVerdict = {
    status: "invalid",
    missing: [],
    failed: [],
    leaks: findSecretLeaks(raw, options.env),
    reasons: [],
  };

  if (base.leaks.length > 0) {
    return { ...base, status: "leaked", reasons: ["receipt contains a secret"] };
  }

  if (!isObject(raw)) {
    return { ...base, reasons: ["receipt is not an object"] };
  }

  if (raw.schema !== RECEIPT_SCHEMA) {
    return {
      ...base,
      reasons: [`schema must be ${RECEIPT_SCHEMA}`],
    };
  }

  if (!isObject(raw.items)) {
    return { ...base, reasons: ["items are missing"] };
  }

  const reasons = base.reasons;
  const items = raw.items;
  const missing: AcceptanceItemId[] = [];
  const failed: AcceptanceItemId[] = [];

  for (const definition of ACCEPTANCE_ITEMS) {
    const itemReasons: string[] = [];
    const item = readItem(items[definition.id], itemReasons);

    if (item === null) {
      missing.push(definition.id);
      reasons.push(
        ...itemReasons.map((reason) => `${definition.id}: ${reason}`),
      );
    } else if (item.status === "fail") {
      failed.push(definition.id);
    }
  }

  const approval = readApproval(raw.approval, reasons);
  const pinnedSha =
    typeof raw.pinnedSha === "string" ? raw.pinnedSha.trim() : "";

  if (!/^[0-9a-f]{40}$/.test(pinnedSha)) {
    reasons.push("pinnedSha must be the full pinned commit SHA");
  }

  if (pinnedSha && pinnedSha !== options.headSha) {
    return {
      ...base,
      status: "stale",
      missing,
      failed,
      reasons: [
        ...reasons,
        `pinnedSha ${pinnedSha.slice(0, 12)} is not the running commit ${options.headSha.slice(0, 12)}`,
      ],
    };
  }

  if (failed.length > 0) {
    return {
      ...base,
      status: "blocked",
      missing,
      failed,
      reasons: [...reasons, ...failed.map((id) => `${id}: recorded fail`)],
    };
  }

  if (missing.length > 0 || approval === null) {
    return {
      ...base,
      status: "incomplete",
      missing,
      failed,
      reasons,
    };
  }

  if (approval.decision === "no-go") {
    return {
      ...base,
      status: "blocked",
      missing,
      failed,
      reasons: [...reasons, "operator recorded no-go"],
    };
  }

  return { ...base, status: "pass", missing, failed, reasons };
}
