import { withContextBanner } from "../../context-banner.ts";

/**
 * Shapes the body sent upstream from the body the customer sent.
 *
 * Kept separate from the entry so the three rewrites it performs are readable in
 * one place:
 *
 * 1. **The model is rewritten to the upstream id.** The public id is a routing
 *    name; only the provider knows its own.
 * 2. **The banner is prepended and counted.** Its characters were already added
 *    to the prompt estimate, so removing it here would bill a prompt the provider
 *    never saw.
 * 3. **The output budget is pinned when the customer did not choose one.**
 *    Without it the provider's own default could exceed what was held, leaving a
 *    charge that settlement has to post without a reservation behind it.
 *
 * Streaming additionally requests usage in the final frame, because a stream that
 * reports no usage is billed from a local estimate instead of the real count.
 */
export function upstreamPayload(input: {
  body: Record<string, unknown>;
  upstreamId: string;
  bannerText: string;
  requestedBudget: number | null;
  outputBudget: number;
}) {
  const payload: Record<string, unknown> = {
    ...input.body,
    model: input.upstreamId,
  };

  if (input.bannerText) {
    payload.messages = withContextBanner(
      Array.isArray(input.body.messages) ? input.body.messages : [],
      input.bannerText,
    );
  }

  if (input.requestedBudget === null && input.outputBudget > 0) {
    payload.max_tokens = input.outputBudget;
  }

  if (input.body.stream === true) {
    const existing =
      input.body.stream_options && typeof input.body.stream_options === "object"
        ? (input.body.stream_options as Record<string, unknown>)
        : {};

    payload.stream_options = { ...existing, include_usage: true };
  }

  return payload;
}
