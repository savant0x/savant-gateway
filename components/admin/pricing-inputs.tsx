/**
 * Labeled price inputs (FID-2026-1103-141).
 *
 * The catalog used to render two unlabeled boxes per row. An operator could not
 * tell whether a number was upstream cost or customer sell price, and neither
 * box said the unit. This control makes the legend, both labels, the unit and
 * the help text visible, and wires them to the inputs with `aria-describedby`
 * and `aria-invalid`.
 */

const INPUT_CLASS =
  "min-w-0 w-full rounded-lg border bg-surface px-2 py-1.5 text-right text-xs tabular-nums outline-none transition-colors focus:border-accent disabled:opacity-60";

export function PricingInputs({
  idPrefix,
  legend,
  input,
  output,
  onInput,
  onOutput,
  help,
  inputInvalid = false,
  outputInvalid = false,
  disabled = false,
  compact = false,
}: {
  idPrefix: string;
  legend: string;
  input: string;
  output: string;
  onInput: (value: string) => void;
  onOutput: (value: string) => void;
  help: string;
  inputInvalid?: boolean;
  outputInvalid?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const helpId = `${idPrefix}-help`;
  const tone = (invalid: boolean) =>
    invalid ? "border-danger/60" : "border-black/10 dark:border-white/10";

  return (
    <fieldset className={compact ? "min-w-[14rem]" : "space-y-2"}>
      <legend className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        {legend}
      </legend>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <div>
          <label
            className="block text-[11px] text-muted"
            htmlFor={`${idPrefix}-input`}
          >
            Input <span className="whitespace-nowrap">$/1M</span>
          </label>
          <input
            aria-describedby={helpId}
            aria-invalid={inputInvalid || undefined}
            className={`${INPUT_CLASS} ${tone(inputInvalid)}`}
            disabled={disabled}
            id={`${idPrefix}-input`}
            inputMode="decimal"
            min={0}
            step="0.000001"
            type="number"
            value={input}
            onChange={(event) => onInput(event.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] text-muted"
            htmlFor={`${idPrefix}-output`}
          >
            Output <span className="whitespace-nowrap">$/1M</span>
          </label>
          <input
            aria-describedby={helpId}
            aria-invalid={outputInvalid || undefined}
            className={`${INPUT_CLASS} ${tone(outputInvalid)}`}
            disabled={disabled}
            id={`${idPrefix}-output`}
            inputMode="decimal"
            min={0}
            step="0.000001"
            type="number"
            value={output}
            onChange={(event) => onOutput(event.target.value)}
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted" id={helpId}>
        {help}
      </p>
    </fieldset>
  );
}
