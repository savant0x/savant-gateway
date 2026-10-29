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

## 2026-10-29 — Generated surfaces outrun implementations

The inherited scaffold had pages, endpoints, and settings for features whose
backends were empty stubs. Prevention: implement and verify the smallest
end-to-end path first; add UI only where a working caller exists.
