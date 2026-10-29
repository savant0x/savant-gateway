# Shared UI primitives

HeroUI v3.2.7 provides Button, Input, Card, Chip, Spinner and form controls.
Font Awesome Free 6.7.2 provides icons through `fa-solid` classes. Tailwind 4
provides layout and responsive utilities. No separate icon system is needed.

## Landing CTA variants

Source: `components/landing/cta.ts`. Shared public navigation/action styling.

```ts
export const primaryCta =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";

export const secondaryCta =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-medium text-foreground transition-colors hover:border-cyan-300/40 hover:bg-white/10";
```

## CodeSample

Source: `components/landing/code-sample.tsx`. Copyable request panel.

```tsx
"use client";
import { Button } from "@heroui/react";
import { useState } from "react";
export function CodeSample({ code, label }: { code: string; label: string }) {
  const [copyLabel, setCopyLabel] = useState("Copy");
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch {
      setCopyLabel("Select to copy");
    }
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#03080d]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-[0.16em] text-muted">{label}</span>
        <Button className="h-7 min-w-0 px-2 text-[11px]" size="sm" variant="ghost" onPress={handleCopy}>{copyLabel}</Button>
      </div>
      <pre className="mono scroll-shell p-4 text-xs leading-6 text-slate-300"><code>{code}</code></pre>
    </div>
  );
}
```

Other shared patterns: `components/dashboard/chips.tsx` defines AccessChip,
StatusChip, and StatCard; `components/ui/pagination.tsx` defines table pagination.
Pass their real source when a target consumes them.
