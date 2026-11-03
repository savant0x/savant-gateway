/**
 * Wire-field compatibility reference (FID-2026-1103-124).
 *
 * The rows are the adapter contract read from `lib/providers/openai.ts` and
 * `lib/providers/anthropic-request.ts`. "Ignored" means the field never reaches
 * the provider; it is not silently reinterpreted.
 */
const PROTOCOL_COMPATIBILITY = [
  {
    field: "model",
    chat: "Rewritten to the upstream id",
    messages: "Rewritten to the upstream id",
    detail: "The public id is a routing name and is never forwarded.",
  },
  {
    field: "messages",
    chat: "Forwarded",
    messages: "Translated to Anthropic content blocks",
    detail:
      "Text and tool calls translate. A remote http(s) image_url is dropped; only data: URLs become base64 image blocks.",
  },
  {
    field: "system / developer",
    chat: "Forwarded unchanged",
    messages: "Joined into the top-level system prompt",
    detail:
      "Developer messages are treated as system text on the Anthropic path.",
  },
  {
    field: "max_tokens / max_completion_tokens",
    chat: "Forwarded; a default is pinned when absent",
    messages: "Mapped to max_tokens",
    detail:
      "max_completion_tokens wins when both are sent. Values above 65,536 are rejected before dispatch.",
  },
  {
    field: "temperature, top_p",
    chat: "Forwarded",
    messages: "Forwarded",
    detail: "Only numeric values are forwarded on the Anthropic path.",
  },
  {
    field: "stop",
    chat: "Forwarded",
    messages: "Mapped to stop_sequences",
    detail: "A single string becomes a one-entry sequence list.",
  },
  {
    field: "tools, tool_choice",
    chat: "Forwarded",
    messages: "Translated",
    detail:
      "Function parameters become input_schema; required becomes any; a named function becomes a tool choice.",
  },
  {
    field: "response_format",
    chat: "Forwarded",
    messages: "Ignored",
    detail:
      "An Anthropic-served model returns prose even when a JSON response_format was requested.",
  },
  {
    field: "seed, logprobs, top_logprobs",
    chat: "Forwarded",
    messages: "Ignored",
    detail: "No emulation is attempted; these fields never reach the provider.",
  },
  {
    field: "n, frequency_penalty, presence_penalty",
    chat: "Forwarded",
    messages: "Ignored",
    detail: "One completion is returned on the Anthropic path.",
  },
  {
    field: "parallel_tool_calls, user",
    chat: "Forwarded",
    messages: "Ignored",
    detail: "Provider-specific; check the upstream model before relying on it.",
  },
  {
    field: "stream",
    chat: "Forwarded; include_usage is added",
    messages: "Forwarded and translated back to OpenAI chunks",
    detail:
      "Both paths end with data: [DONE]; usage is settled after the stream closes.",
  },
] as const;

export function ApiCompatibility() {
  return (
    <section className="space-y-5">
      <div className="scroll-mt-24" id="wire-fields">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
          Wire-field support
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          What reaches the provider, per protocol
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          A model served over OpenAI chat receives the body essentially
          unchanged. A model served over Anthropic Messages is translated, and
          fields with no Anthropic equivalent are ignored rather than emulated.
        </p>
      </div>

      <div className="scroll-shell rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>OpenAI chat</th>
              <th>Anthropic Messages</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {PROTOCOL_COMPATIBILITY.map((row) => (
              <tr key={row.field}>
                <td className="whitespace-nowrap">
                  <code className="mono text-xs text-cyan-200">
                    {row.field}
                  </code>
                </td>
                <td className="text-xs leading-5 text-muted">{row.chat}</td>
                <td className="text-xs leading-5 text-muted">{row.messages}</td>
                <td className="max-w-[28rem] text-sm leading-6 text-muted">
                  {row.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
