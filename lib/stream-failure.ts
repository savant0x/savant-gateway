/**
 * Failure frames inside a streamed completion.
 *
 * A provider can report a failure as a stream event and still close the
 * response cleanly, including sending the protocol terminator afterwards. The
 * relay used to treat the terminator as the only completion signal, so a failed
 * call settled `ok` and was billed as an estimate. This reader answers one
 * question — does this frame carry a failure? — and leaves what to do about it
 * to the relay.
 */

function messageFrom(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();

    return text ? text : null;
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const message = record.message;

    if (typeof message === "string" && message.trim()) return message.trim();

    const code = record.code ?? record.type ?? record.error_class;

    if (typeof code === "string" && code.trim()) return code.trim();
  }

  return null;
}

/**
 * `null` for every frame that is not a failure, including the common shapes that
 * look like one: an explicit `error: null`, a falsy flag and the terminator.
 * The message is passed through unchanged so the caller can decide how much of
 * it a customer may see.
 */
export function readStreamFailure(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const failure = record.error;

  if (failure === undefined || failure === null || failure === false) {
    return null;
  }

  // An empty string, an empty object or an array is a placeholder some
  // providers emit on every frame; treating it as a failure would fail every
  // clean stream.
  if (typeof failure === "string" && !failure.trim()) return null;
  if (Array.isArray(failure)) return null;
  if (
    typeof failure === "object" &&
    Object.keys(failure as Record<string, unknown>).length === 0
  ) {
    return null;
  }

  return messageFrom(failure) ?? "Provider reported an error mid-stream";
}
