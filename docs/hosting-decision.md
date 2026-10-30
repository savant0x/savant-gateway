# Production hosting — Vercel plus libSQL, or one persistent process

Decision date: 2026-10-30. Status: **do not port the data layer. Deploy one
persistent Node process with a local volume.** Vercel remains unable to serve
this build and is not the launch host. The port stays planned, not started:
FID-2026-1030-066 is `converged` and revivable, and no work has been deleted.

This document records the evidence behind that decision, including what the
single-process option costs rather than only what it saves.

## What forced the question

The Vercel deployment returns 500 on every route because the startup gate
rejects the configuration, and it is right to: `better-sqlite3` needs a durable
local file, Vercel Functions have no durable writable filesystem, and each
instance would get its own copy. Vercel's own guidance says SQLite cannot be used
there for exactly that reason
(<https://vercel.com/kb/guide/is-sqlite-supported-in-vercel>).

The alternative was the libSQL port. Its plan is measured, not estimated.

## What the port actually costs

From `939accc`, recorded in FID-066:

| Item | Measured |
| --- | --- |
| Files that must be re-read and re-verified | 103 |
| `prepare` call sites gaining `await` | 265 in `lib`, 405 tree-wide |
| Transaction wrappers whose semantics change | 35 |
| Unbounded statement loop inside a transaction | 1 (`lib/store/billing.ts:144`) |
| Production-config codes that must be replaced | 3 |
| Process-local admission limits needing redesign | 3 modules |

That is a rewrite of the money path before launch: settlement, holds, ledger and
replay guards all move to an async client with a 5-second transaction window,
and the per-instance rate limiter has to be solved separately because serverless
multiplies it by instance count.

## Prices as published at decision time

| Option | Monthly, low traffic | Source |
| --- | --- | --- |
| Vercel Pro + Turso Scaler | 20.00 + 24.92 = **44.92** | <https://vercel.com/docs/plans/pro-plan>, <https://turso.tech/pricing> |
| Vercel Pro + Neon free/Launch | 20.00 + 0–15 usage | <https://neon.com/pricing> |
| **Fly.io** one 512 MB Machine + 1 GB Volume | **3.84** | <https://www.fly.io/pricing> |
| Railway Hobby + 1 GB Volume | 5.00 floor + 0.15 | <https://docs.railway.com/pricing/plans> |
| Render Starter + 1 GB Disk | 7.25 | <https://render.com/pricing> |
| DigitalOcean 1 GB Droplet | 6.00 (25 GB disk included) | <https://www.digitalocean.com/pricing/droplets> |
| Hetzner US CPX11 + 10 GB Volume | 17.49 + ~0.67 + IPv4 | <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/> |

Vercel Hobby cannot be used commercially, so the 20.00 is not avoidable if Vercel
is the host. The 24.92 is the cheapest tier whose 30-day point-in-time-recovery
window matches the "up to 30 days" retention the privacy notice already claims.

## The fact that decided it

This code runs SQLite in WAL mode (`lib/db.ts:329`). SQLite documents that WAL
requires every process to be on the same host and does not work over a network
filesystem (<https://www.sqlite.org/wal.html>).

- **Fly volumes** are "local persistent storage": a slice of NVMe on the same
  physical server as the Machine, explicitly "not network storage"
  (<https://docs.fly.io/volumes/overview>).
- **Railway** documents mount and replica constraints but publishes no `fsync`,
  `flock` or WAL guarantees, and has a community report of a mounted SQLite file
  becoming malformed (<https://station.railway.com/questions/persistent-volume-guarantees-for-safe-sq-92a3cfa9>).
- **Render** documents persistent disks but warns that restoring a disk snapshot
  behind a custom database "might restore to a corrupted state"
  (<https://render.com/docs/disks>).
- **Hetzner** advises against running databases on its network-attached volumes
  at all (<https://docs.hetzner.com/storage/general/which-storage-is-right-for-me/>).

So the cheapest option is not the one that fits the storage model; the one that
fits is also nearly the cheapest.

## What shipping on one process costs us

Not a free lunch, and none of this is hidden:

1. **We own operations.** Patching, process supervision, TLS, alerting and
   backups become ours. Fly reduces this to a small surface, but not to zero.
2. **One machine is a single point of failure.** A host failure is downtime until
   a replacement starts in the same region; the volume does not replicate.
3. **Deploys are not seamless.** A volume attaches to one Machine, so a deploy
   stops the old process before starting the new one: seconds of downtime.
4. **No per-PR preview environments** without extra work.
5. **No global edge and no burst capacity.** Traffic beyond one machine's
   capacity is a wall, not a scaling event. Fronting with Cloudflare later
   recovers CDN caching and DNS, not compute.
6. **The rate limiter stays correct only because there is one process.** Any
   future scale-out re-opens the shared-admission problem FID-066 raised.

## What it buys

1. **No port before launch.** 103 files and 301 call sites stay untouched; the
   settlement path keeps its synchronous transaction semantics and its tests.
2. **No 5-second transaction window**, no unverified remote `PRAGMA foreign_keys`,
   no uncertainty about whether libSQL databases are still provisioned.
3. **Streaming is unbounded.** Vercel caps an invocation at 300 s by default and
   counts the streamed response inside it, so a stalled upstream could cut a live
   stream; a persistent process has no such ceiling.
4. **Roughly 40 USD/month cheaper**, and the 30-day retention claim becomes
   implementable with our own SQLite-aware backups instead of a paid PITR tier.
5. **It matches the launch plan.** `docs/launch-plan.md` Phase 3 asks for a
   durable volume, WAL behaviour, backups and a restore drill — the plan was
   written for this deployment model, and Vercel was the outlier.

## Options considered

1. **Vercel + libSQL (FID-066).** Correctly planned and technically sound, and it
   is the only path that keeps serverless. Rejected *for launch*: it rewrites the
   money path and leaves the admission limiter unsolved, to save an operational
   burden of roughly one machine and about 40 USD/month.
2. **Vercel + Neon.** Same async port plus a dialect rewrite of 46 SQLite
   constructs. Rejected for launch: strictly larger than option 1.
3. **Vercel for pages, a separate host for the API.** Splits the origin that
   cookies, same-origin mutation checks and Stripe webhooks depend on.
   Rejected: two deployment surfaces for one process-bound database.
4. **Railway / Render / DigitalOcean droplet.** Viable, and each is a reasonable
   fallback. Railway and Render do not publish the locking guarantees WAL wants;
   a droplet costs the same as Fly but adds OS ownership. Rejected in favour of
   the option whose storage model is documented as same-host local disk.
5. **Fly.io, one Machine, one local Volume.** **Selected.**

## Selected configuration

- One `shared-cpu-1x` Machine, 512 MB, one US region, one 1 GB Volume mounted at
  the database path.
- Exactly one Machine with no autoscaler and no auto-stop, because a second
  process against the same file is what the startup gate exists to prevent.
- `DB_PATH` on the mounted volume, absolute, outside any temporary directory, so
  the existing production configuration check passes unchanged.
- `NEXT_PUBLIC_SITE_URL` set to the Fly hostname (or the Cloudflare-fronted
  domain) so the admin session cookie is `Secure` and Stripe redirects resolve.
- Scheduled SQLite-aware backups copied off the machine, plus a documented
  restore drill, because provider snapshots of a live SQLite file are not a
  backup.
- The Vercel project is left dormant rather than deleted. Removing it is a
  destructive action and stays the operator's call.

## Revisit criteria

Return to FID-066 and the libSQL port only when one of these is true:

1. Multi-region latency is a product requirement that one process cannot serve.
2. Sustained load exceeds a single machine's measured capacity.
3. Horizontal scale is needed for availability, not just throughput — which
   requires the port *and* the shared-admission design together.
4. Fly's volume semantics prove inadequate in the restore drill or under load.
