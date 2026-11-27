# FID register integrity

FID-2026-1126-002 reconciled the active queue, scope, archived metadata and
evidence, the changelog, and relative links. The existing repository check now
enforces those boundaries. Implementation commit `1bc0caf`.

`npm run verify` passed all 12 gates, with 1,244 unit tests and 20 PostgreSQL
concurrency tests, zero skips, 731 HTTP checks, four showcase browser checks,
and a passing recovery drill. The two focused FID fixtures also passed.

The [FID was archived](../fids/archive/FID-2026-1126-002-fid-register-integrity.md).
The [FID queue](../fids/README.md) records the dependency order for the
remaining InferHub launch work.
