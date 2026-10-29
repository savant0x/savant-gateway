import type { ModelAccess } from "./types";

export type GroupSource = "auto" | "manual";

export type ModelGroupDefinition = {
  slug: string;
  label: string;
  billingMode: ModelAccess;
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
};

export type GroupValues = {
  label: string;
  billingMode: ModelAccess;
  description: string | null;
  sortOrder: number;
  /** Keep the group's models out of the public catalog and model list. */
  hidden: boolean;
};

export type GroupCreateValues = GroupValues & { slug: string };

export type GroupReadResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

export const GROUP_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
export const RESERVED_GROUP_SLUGS = new Set(["free", "paid", "subscription"]);

export const SYSTEM_GROUP_LABELS: Record<ModelAccess, string> = {
  free: "Free",
  paid: "Paid",
  subscription: "Subscription",
};

export const SYSTEM_GROUP_DEFINITIONS: readonly ModelGroupDefinition[] = [
  {
    slug: "free",
    label: "Free",
    billingMode: "free",
    description: "Weighted free pool. No credit hold and no charge.",
    sortOrder: 0,
    isSystem: true,
  },
  {
    slug: "paid",
    label: "Paid",
    billingMode: "paid",
    description: "Prepaid credit with a per-request hold and settlement.",
    sortOrder: 10,
    isSystem: true,
  },
  {
    slug: "subscription",
    label: "Subscription",
    billingMode: "subscription",
    description: "Plan-gated catalog tier. Entitlement is owned by plans.",
    sortOrder: 20,
    isSystem: true,
  },
];

const BILLING_MODES = new Set<ModelAccess>(["free", "paid", "subscription"]);

export function isReservedGroupSlug(slug: string) {
  return RESERVED_GROUP_SLUGS.has(slug);
}

export function isSystemGroup(slug: string) {
  return isReservedGroupSlug(slug);
}

/** The provider-derived group used when an operator has not overridden it. */
export function legacyAccessFor(row: {
  allowFree: boolean;
  tokenWeight: number;
  upstreamId: string;
}): ModelAccess {
  if (row.allowFree && row.tokenWeight > 0) return "free";
  if (row.upstreamId.startsWith("free/")) return "subscription";

  return "paid";
}

export function defaultGroupSlug(row: {
  allowFree: boolean;
  tokenWeight: number;
  upstreamId: string;
}) {
  return legacyAccessFor(row);
}

/** A group's billing mode wins; the provider-derived value is only a fallback. */
export function accessFromGroup(
  billingMode: ModelAccess | null | undefined,
  fallback: ModelAccess,
): ModelAccess {
  return billingMode && BILLING_MODES.has(billingMode) ? billingMode : fallback;
}

/**
 * A free group is authoritative: both sell prices are zero. Every other group
 * keeps whatever prices the operator or markup pass already set.
 */
export function pricesForGroup(input: {
  billingMode: ModelAccess;
  sellInputMicros: number;
  sellOutputMicros: number;
}) {
  if (input.billingMode !== "free") {
    return {
      sellInputMicros: input.sellInputMicros,
      sellOutputMicros: input.sellOutputMicros,
    };
  }

  return { sellInputMicros: 0, sellOutputMicros: 0 };
}

export function canDeleteGroup(group: { isSystem: boolean }) {
  return !group.isSystem;
}

function readLabel(value: unknown) {
  if (typeof value !== "string") return null;

  const label = value.trim();

  return label.length >= 1 && label.length <= 40 ? label : null;
}

function readBillingMode(value: unknown): ModelAccess | null {
  return typeof value === "string" && BILLING_MODES.has(value as ModelAccess)
    ? (value as ModelAccess)
    : null;
}

function readDescription(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const description = value.trim();

  if (description.length > 200) return { ok: false };

  return { ok: true, value: description || null };
}

function readSortOrder(value: unknown) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;

  return Math.max(-100_000, Math.min(100_000, value));
}

function readCommon(input: unknown): GroupReadResult<GroupValues> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Group fields are required." };
  }

  const record = input as Record<string, unknown>;
  const label = readLabel(record.label);
  const billingMode = readBillingMode(record.billingMode);
  const description = readDescription(record.description);
  const sortOrder = readSortOrder(record.sortOrder);

  if (record.hidden !== undefined && typeof record.hidden !== "boolean") {
    return { ok: false, error: "Hidden must be true or false." };
  }

  if (!label) {
    return { ok: false, error: "Label must be 1 to 40 characters." };
  }

  if (!billingMode) {
    return {
      ok: false,
      error: "Billing mode must be free, paid, or subscription.",
    };
  }

  if (!description.ok) {
    return { ok: false, error: "Description must be at most 200 characters." };
  }

  if (sortOrder === null) {
    return { ok: false, error: "Sort order must be an integer." };
  }

  return {
    ok: true,
    value: {
      label,
      billingMode,
      description: description.value,
      sortOrder,
      hidden: record.hidden === true,
    },
  };
}

export function readGroupCreateInput(
  input: unknown,
): GroupReadResult<GroupCreateValues> {
  const common = readCommon(input);

  if (!common.ok) return common;

  const record = input as Record<string, unknown>;
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";

  if (!GROUP_SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error:
        "Slug must be 2 to 32 lowercase letters, digits, or dashes, starting with a letter.",
    };
  }

  if (isReservedGroupSlug(slug)) {
    return { ok: false, error: "That slug belongs to a system group." };
  }

  return { ok: true, value: { ...common.value, slug } };
}

export function readGroupUpdateInput(
  input: unknown,
): GroupReadResult<GroupValues> {
  return readCommon(input);
}

export function readGroupReassignment(input: {
  slug: string;
  reassignTo: unknown;
  groups: Array<{ slug: string }>;
}): GroupReadResult<string> {
  const reassignTo =
    typeof input.reassignTo === "string" ? input.reassignTo.trim() : "";

  if (!reassignTo) {
    return { ok: false, error: "Choose a group to receive the models." };
  }

  if (reassignTo === input.slug) {
    return {
      ok: false,
      error: "Models cannot be reassigned to the same group.",
    };
  }

  if (!input.groups.some((group) => group.slug === reassignTo)) {
    return { ok: false, error: "The destination group does not exist." };
  }

  return { ok: true, value: reassignTo };
}
