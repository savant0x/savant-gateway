export const SUPPORT_KINDS = [
  "support",
  "billing",
  "refund",
  "privacy",
  "data-deletion",
] as const;

export type SupportKind = (typeof SUPPORT_KINDS)[number];

export const SUPPORT_KIND_LABELS: Record<SupportKind, string> = {
  support: "Technical support",
  billing: "Billing or credit question",
  refund: "Refund or dispute",
  privacy: "Privacy question",
  "data-deletion": "Account or data deletion",
};

export const SUPPORT_STATUSES = ["open", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type SupportRequestInput = {
  kind: SupportKind;
  subject: string;
  message: string;
};

export type SupportSummary = {
  id: string;
  kind: SupportKind;
  subject: string;
  message: string;
  status: SupportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 120;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function multiline(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

export function readSupportRequest(
  input: unknown,
): { ok: true; value: SupportRequestInput } | { ok: false; error: string } {
  const body =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const kind =
    typeof body.kind === "string" ? body.kind.trim() : ("" as string);

  if (!SUPPORT_KINDS.includes(kind as SupportKind)) {
    return { ok: false, error: "Choose a support request type." };
  }

  const subject =
    typeof body.subject === "string" ? singleLine(body.subject) : "";
  const message =
    typeof body.message === "string" ? multiline(body.message) : "";

  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) {
    return {
      ok: false,
      error: `Subject must be ${SUBJECT_MIN}-${SUBJECT_MAX} characters.`,
    };
  }

  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters.`,
    };
  }

  return {
    ok: true,
    value: { kind: kind as SupportKind, subject, message },
  };
}

export function readResolutionNote(input: unknown) {
  const body =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const note = typeof body.note === "string" ? multiline(body.note) : "";

  if (note.length > 1000) {
    return {
      ok: false as const,
      error: "Resolution note must be 1000 characters or fewer.",
    };
  }

  return { ok: true as const, value: note };
}
