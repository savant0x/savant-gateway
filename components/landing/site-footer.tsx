import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#03080d]">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <Image
                alt=""
                className="h-9 w-9 rounded-xl ring-1 ring-cyan-300/30"
                height={36}
                src="/logo-32.png"
                width={36}
              />
              <span className="text-sm font-semibold">{siteConfig.name}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              {siteConfig.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <Link className="text-muted hover:text-foreground" href="/signup">
              Create account
            </Link>
            <Link className="text-muted hover:text-foreground" href="/login">
              Sign in
            </Link>
            <Link className="text-muted hover:text-foreground" href="/account">
              Account
            </Link>
            <Link
              className="text-muted hover:text-foreground"
              href={siteConfig.adminHref}
            >
              Admin
            </Link>
            <Link className="text-muted hover:text-foreground" href="/models">
              Models
            </Link>
            <Link className="text-muted hover:text-foreground" href="/docs">
              API reference
            </Link>
            <Link
              className="text-muted hover:text-foreground"
              href="/#quickstart"
            >
              Quick start
            </Link>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{siteConfig.name} · OpenAI-compatible gateway</span>
          <span>Not affiliated with the upstream provider.</span>
        </div>
      </div>
    </footer>
  );
}
