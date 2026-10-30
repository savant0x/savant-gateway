import type { ReactElement } from "react";

/**
 * Shared layout for generated social cards (`opengraph-image` routes).
 *
 * `next/og` renders this through satori, which supports a subset of CSS: flex
 * layout only, no cascading stylesheets, no Tailwind. Everything is therefore
 * inline, and the palette is repeated here rather than read from the CSS
 * variables the site uses at runtime.
 */
const palette = {
  background: "linear-gradient(135deg, #05070a 0%, #080b11 55%, #041014 100%)",
  accent: "#00fbff",
  text: "#f7fbfc",
  muted: "#9fb3bb",
  faint: "rgba(0, 251, 255, 0.22)",
} as const;

export function socialCard({
  eyebrow,
  title,
  subtitle,
  lines,
}: {
  /** Small uppercase label, e.g. the page's section. */
  eyebrow: string;
  /** The one statement the card makes. Keep it under ~34 characters. */
  title: string;
  /** Supporting sentence, under ~70 characters. */
  subtitle: string;
  /** Factual rows drawn from the page's own data. */
  lines: string[];
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 80px",
        background: palette.background,
        color: palette.text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            letterSpacing: 6,
            color: palette.accent,
          }}
        >
          {eyebrow.toUpperCase()}
        </div>
        <div style={{ display: "flex", fontSize: 20, color: palette.muted }}>
          SAVANT GATEWAY
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 28,
            color: palette.muted,
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            height: 1,
            width: "100%",
            background: palette.faint,
            marginBottom: 24,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {lines.map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                fontSize: 22,
                color: palette.muted,
                marginBottom: 8,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
