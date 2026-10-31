import Link from "next/link";

export type DocsSection = "start" | "api" | "faq";

const LINKS = [
  { key: "start", href: "/docs/start", label: "Newcomer guide" },
  { key: "api", href: "/docs", label: "API reference" },
  { key: "faq", href: "/docs/faq", label: "FAQ" },
  { key: "support", href: "/support", label: "Support" },
] as const;

export function DocsNav({ active }: { active: DocsSection }) {
  return (
    <nav
      aria-label="Documentation"
      className="mt-7 flex flex-wrap gap-2 text-xs"
    >
      {LINKS.map((link) => {
        const current = link.key === active;

        return (
          <Link
            key={link.key}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-foreground"
                : "rounded-full border border-white/10 canvas-surface px-3 py-1.5 text-muted transition-colors hover:text-foreground"
            }
            href={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
