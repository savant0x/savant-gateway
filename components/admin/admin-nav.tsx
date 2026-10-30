"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", icon: "fa-gauge-high", label: "Overview" },
  { href: "/admin/customers", icon: "fa-users", label: "Customers" },
  { href: "/admin/catalog", icon: "fa-layer-group", label: "Catalog" },
  { href: "/admin/groups", icon: "fa-object-group", label: "Groups" },
  { href: "/admin/plans", icon: "fa-rectangle-list", label: "Plans" },
  {
    href: "/admin/subscriptions",
    icon: "fa-arrows-rotate",
    label: "Subscriptions",
  },
  { href: "/admin/providers", icon: "fa-plug", label: "Providers" },
  { href: "/admin/support", icon: "fa-life-ring", label: "Support" },
  { href: "/admin/gateway", icon: "fa-sliders", label: "Gateway" },
  { href: "/admin/pricing", icon: "fa-calculator", label: "Pricing" },
  { href: "/admin/analytics", icon: "fa-chart-line", label: "Analytics" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation" className="admin-tabs">
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-cyan-300/10 text-cyan-100"
                : "text-muted hover:bg-white/5 hover:text-foreground"
            }`}
            href={item.href}
          >
            <i aria-hidden className={`fa-solid ${item.icon} text-xs`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
