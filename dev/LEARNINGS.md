# LEARNINGS

## 2026-10-29 — The free signal must be the enforced pool

Provider metadata can advertise a capability the account cannot exercise.
`allowFree` was true on paid models that returned `402` on a zero-balance
account. The reliable rule was the `free/*` id pool, confirmed by a live call.
Prevention: derive access from the system that enforces it, then verify with a
real request.

## 2026-10-29 — A header check is not a network boundary

The dashboard endpoints trust the `Host` header. A remote client that can reach
the server can send `Host: localhost`. Prevention: a development guard must be
implemented at the process/network boundary or with a server-side token; it must
not be described as a security boundary.

## 2026-10-30 — Verify build-output assumptions against the installed framework

The earlier hydration investigation attributed a dead dev runtime to shared
build output. That cause was not established: Next.js 16 isolates development
output under `.next/dev`; both `.next/dev` and production artifacts exist in
this checkout. Official Next.js 16 upgrade documentation confirms concurrent
dev/build isolation. A dead runtime still requires process, network, console
and actual interaction checks, but do not stop a dev server based only on the
old directory-collision assumption. Deleting the entire `.next` tree would
still destroy dev state. Source: Next.js `version-16.mdx`, fetched through
Context7 on 2026-10-30.

## 2026-10-30 — HeroUI `onPress` is not `element.click()`

`Button` from `@heroui/react` drives its action through react-aria pointer
handlers. A synthetic `element.click()` in an evaluation harness changes nothing
and looks like a dead control. Prevention: drive those buttons with a real
pointer (Playwright click) before reporting a interaction bug.

## 2026-10-30 — The server's clock is not the reader's clock

A formatter shared by the server render and the browser has no zone to pick but
UTC, and pinning it there bakes UTC into every surface at once: a reader in
Salem saw `01:58 UTC` for an event their own clock placed the previous evening.
Prevention: render the one zone both sides can compute (UTC) and correct it once
after mount in a single client component that keeps the ISO instant in
`datetime`; never send a date-only value through that path, because midnight UTC
is the previous day west of Greenwich.

## 2026-10-29 — Generated surfaces outrun implementations

The inherited scaffold had pages, endpoints, and settings for features whose
backends were empty stubs. Prevention: implement and verify the smallest
end-to-end path first; add UI only where a working caller exists.
