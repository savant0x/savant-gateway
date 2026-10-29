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
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {label}
        </span>
        <Button
          className="h-7 min-w-0 px-2 text-[11px]"
          size="sm"
          variant="ghost"
          onPress={handleCopy}
        >
          {copyLabel}
        </Button>
      </div>
      <pre className="mono scroll-shell p-4 text-xs leading-6 text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
