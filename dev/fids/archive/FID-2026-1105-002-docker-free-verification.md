# FID: Docker-free verification and operational workflows

**Filename:** `FID-2026-1105-002-docker-free-verification.md`
**ID:** FID-2026-1105-002
**Severity:** high
**Status:** closed
**Created:** 2026-11-05 11:00
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Remove the repository's reliance on Docker where it is wired into development,
verification, CI, or operational delivery, and replace each active use with a
documented, executable path. Preserve the mandatory real PostgreSQL concurrency
proof and fail-closed gates. The operator states Docker cannot run on this host.
Implemented in `a3ed2a1` and verified locally; Linux CI, a clean install with
postinstall scripts enabled, the load gate and hosted delivery remain
unobserved.

## Environment

- **OS:** Windows workstation; CI currently uses Ubuntu.
- **Language/Runtime:** Node 24 and npm as declared by `package.json`.
- **Tool Versions:** Local native PostgreSQL reports 17.6.
- **Commit/State:** implementation commit `a3ed2a1` on `main`; two untracked
  operator files remain preserved and uncommitted.

## Detailed Description

### Problem

The normal push invokes `npm run verify`. With no `TEST_DATABASE_URL`,
`scripts/disposable-postgres.mjs` tries `docker info` and the PostgreSQL gate
fails. The same helper is used by the disposable push wrapper and by HTTP and
load suites that require real PostgreSQL. The prior push also failed its HTTP
paid-account burst check using the PGlite fixture. The managed-database wrapper
refused its configured remote TLS mode; this must not be bypassed.

### Expected Behavior

Following the documented setup, the supported local and CI workflows run
without Docker and retain real, independently connected PostgreSQL transactions.
Normal `git push` must be capable of completing its unchanged mandatory gates.
The local flow must not depend on an untracked prior installation or a remote
account, and must never target an application database implicitly.

### Root Cause

`scripts/disposable-postgres.mjs` selects a Docker container as its only
automatic real-PostgreSQL fallback. CI additionally declares a PostgreSQL
container service. Current setup text directs operators toward Docker despite
the host constraint. `Dockerfile`, `fly.toml`, the entrypoint and delivery
documentation also carry a container-based deployment path and require an
explicit current-use inventory and replacement decision in implementation.

Inventory result: `README.md` identifies Vercel/PostgreSQL as the current
delivery path; `docs/deployment-runbook.md` labels Fly/SQLite superseded.
Remove the obsolete Fly/container packaging and its active Node-image check;
retain historical records with accurate labels and repair any live links.
The existing Vercel path is the replacement; do not deploy or claim a new
hosted receipt. CI's PostgreSQL service is an active Docker dependency and
must be replaced by the pinned native lifecycle, not merely documented away.

Implementation confirmed both failure modes: the Docker-only fallback blocked
the mandatory proof, and the HTTP burst failure occurred on PGlite's single
connection, where serialized probes refill the account bucket between calls.
`verify` now supplies one real PostgreSQL cluster to both HTTP suites, and the
three-wide probe stays under provider admission. A wider burst was measured and
rejected: it produced 40 admitted and 80 provider-scope refusals, never the
paid scope it claims to test.

### Evidence

```text
git push: postgres-concurrency: FAIL — Docker is unavailable.
git push: http-suite FAIL: paid account limit holds across different keys
npm run push:supabase: FAIL — Unverified TLS modes are refused for a remote provisioning host
postgres --version: postgres (PostgreSQL) 17.6
pg_ctl status: local PostgreSQL is running on 127.0.0.1:55432
```

The local binary and running cluster are ignored state, not a reproducible
installation or authorization to reset the cluster. The HTTP failure is a
separate observed gate failure; its cause must be measured against a real
disposable PostgreSQL fixture before any conclusion is drawn.

## Impact Assessment

### Affected Components

- `scripts/disposable-postgres.mjs`, `scripts/postgres-concurrency-proof.mjs`,
  `scripts/with-disposable-postgres.mjs`, and `scripts/http-suite/db.mjs`.
- `scripts/load-acceptance.mjs`, `scripts/verify.mjs`, the pre-push hook,
  `package.json`, and `.github/workflows/ci.yml`.
- Current operator instructions, configuration, repository checks and any
  active deployment packaging found during the implementation inventory.

### Risk Level

- [x] High: mandatory push verification is blocked on this workstation.

## Proposed Solution

### Approach

Select `@embedded-postgres/windows-x64` and `@embedded-postgres/linux-x64`
at exact version `17.11.0-beta.19`, locked as platform-specific development
dependencies. The npm registry lists both packages, MIT license and postinstall
hydration; their archives contain native PostgreSQL binaries. The supporting
package documentation identifies PostgreSQL binaries as Apache-2.0. Use the
binary exports with a project-owned lifecycle, not the higher-level package:
the inspected higher-level version writes its password file to the system temp
directory, outside this repository's boundary. Verify the exact selected
release's exports and lifecycle scripts during the clean-install proof. Fail
closed with an actionable error on unsupported architectures or missing binaries.

Use the selected pinned native distribution with a newly created local cluster
dedicated to each verification run. The existing binary under
`node_modules/.savant-pg` is evidence of feasibility only. Use
PostgreSQL's native initialization and server lifecycle rather than a Docker
daemon. Keep explicit disposable endpoint overrides with their existing safety
checks and verified TLS for remote provisioning. Do not replace concurrent
PostgreSQL tests with PGlite or disable any gate.

The cluster must bind only to loopback, use a unique generated directory and
port, start and stop under the invoking user, and clean up only paths created
by that run. Prevent accidental reuse of an existing cluster or application
URL. Handle startup failures, child exit, cleanup errors, and interruption
honestly; report leftovers without deleting unrelated files. The installation
and scratch location must respect the repository's filesystem boundary. A
hard process kill may require documented manual cleanup; do not promise cleanup
after a process that cannot execute it.

`verify` owns one native cluster for its whole sequential run when no explicit
test endpoint is supplied. It passes its generated URL to both test variables,
including the ordinary unit suite, before spawning gates, and shuts down in a
finally path. This is necessary because the existing runner copies an already
supplied URL to HTTP but the concurrency gate's private fallback cannot pass
its URL back to the parent. A directly invoked PostgreSQL proof, trial suite,
or load gate uses the same helper independently. Explicit overrides remain
separate and must undergo safety validation before schema-resetting HTTP work.
The normal hook remains `npm run verify` and must neither bypass nor duplicate
the gate list. CI uses the native packages with no container service.

Create each run directory exclusively below an ignored project scratch root;
record an unpredictable ownership marker and validate resolved paths and marker
before deletion. Put the random per-run database password file inside that
directory, restrict access, remove it after initialization, and never log it.
Use `initdb` with password authentication and `pg_ctl` to start PostgreSQL on
127.0.0.1 with an ephemeral port; readiness must authenticate to the expected
new cluster. A port-selection race is a startup failure, never permission to
attach to an existing server. Stop the owned server before deleting its data;
on uncertain ownership or stop failure retain the directory and fail the gate.
Do not create operating-system users or change host-wide PostgreSQL settings.

### Steps

1. Inventory every active Docker invocation, CI service, package command,
   deployment configuration and current setup instruction; distinguish active
   operational requirements from historical evidence. Confirm the supported
   deployment path and replace active container-dependent delivery wiring with
   a verified Docker-free path without deploying or publishing.
2. Select and pin native PostgreSQL distribution and implement a bounded,
   isolated cluster lifecycle. Preserve explicit disposable URL safety checks,
   remote TLS verification and credential redaction.
3. Wire the same real PostgreSQL lifecycle through normal verification, push,
   concurrency, real-PostgreSQL HTTP and load paths. Update CI to obtain real
   PostgreSQL without a Docker service. Keep concurrency proofs mandatory.
4. Diagnose the observed HTTP burst failure on real PostgreSQL and correct any
   reproducible defect; do not change limits or assertions merely to pass.
5. Update current setup and operator documentation, commands, contract checks
   and error messages. Preserve historical evidence and unrelated user files.
6. Prove fresh installation, native lifecycle, refusal and cleanup paths, real
   concurrency, HTTP and the complete gate; commit implementation, record its
   receipt, close and archive this FID, and push through the normal hook.

### Verification

Add `tests/disposable-postgres.test.mjs` to exercise isolation, startup failure,
cleanup, endpoint handling and refusal of unsafe targets; include real native
PostgreSQL integration evidence on the Windows host and a Linux CI execution.
Run each existing concurrency test with no skips, the HTTP suites against real
PostgreSQL, the full `npm run verify`, and a normal `git push` with no Docker
daemon. Verify the lifecycle's callers and absence of active Docker execution
through targeted searches. Distinguish a local success from CI and hosted
delivery observations; do not claim either until observed.

Lifecycle tests must cover two parallel isolated runs, occupied-port and
startup failures, hostile or missing ownership markers, symlink/path escape,
stop and cleanup failures, child failure and interrupt; assert unrelated data
and the pre-existing local cluster survive. Exercise the user-supplied URL
safety checks and fail-closed remote TLS. Prove authentication and two actual
simultaneous connections against the generated database. Test a fresh npm
install with postinstall enabled on Windows x64 and Linux x64, and document the
unsupported-platform refusal. A Linux CI result is an external observation;
do not fabricate it if the workflow has not run.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/disposable-postgres.test.mjs — `npm test`.
- gate: test tests/settlement-concurrency.test.mjs — `npm run test:postgres`.
- gate: test tests/admission-concurrency.test.mjs — `npm run test:postgres`.
- gate: test tests/content-job-concurrency.test.mjs — `npm run test:postgres`.
- gate: test tests/content-link-concurrency.test.mjs — `npm run test:postgres`.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, including HTTP and recovery.

### Verification Receipt

Local Windows x64, Node 24.21.0, npm 12.2.1, 2026-11-05.

- `node --test tests/disposable-postgres.test.mjs` — exit 0: 9 tests, 9
  passed, 0 failed, 0 skipped in 12.6 s. Covers pinned-platform refusal,
  application/remote endpoint refusal, foreign and mismatched ownership
  markers, symlink escape, one cluster with two real connections and cleanup,
  two parallel clusters on distinct ports, occupied-port startup failure and
  scratch-root identity.
- Smoke: `startDisposablePostgres()` reported PostgreSQL 17.11.0-beta.19 on
  127.0.0.1:50350; two clients connected; `current_setting('data_directory')`
  matched the run directory; `close()` returned `{ ok: true }` and the run
  directory was gone.
- `npm run test:postgres` — exit 0: seven assertions across the four declared
  files, zero skips, native cluster on 127.0.0.1:59319. The verifier summary
  reports 2/2 because it reads the first file's totals.
- `npm run test:http` under `verify` — exit 0: 776 main checks on real
  PostgreSQL plus the trial suite's concurrent-admission checks; the paid burst
  and paid-scope assertions pass.
- `npm run verify` — exit 0: 11/11 gates, 1,046/1,046 tests with zero skips,
  duration 140.6 s, summary `.verify/summary.json`. Lint, typecheck, storage,
  config, repository, quality and build passed; recovery 14/14.
- `git diff --cached --check` clean; the commit-msg hook reported
  `attribution-guard: PASS (no coding-agent credit found)`.
- Cleanup: `.scratch/postgres` was empty after the run; every gate-owned
  directory was removed.

Not observed: Linux CI (workflow updated, not run), a fresh `npm ci` with
postinstall scripts enabled, `npm run test:load`, and any hosted deployment.

## Perfection Loop

### Loop 1 — RED

- **RED:** Automatic PostgreSQL provisioning invokes Docker; the normal push
  was refused, and a second HTTP gate failure was observed.
- **GREEN:** Proposed isolated native PostgreSQL provisioning and a full
  inventory of active Docker dependencies, retaining mandatory gates.
- **AUDIT:** `rg` identified consumers in the proof, push wrapper, HTTP
  database helper and CI. `pg_ctl status` confirmed a running local native
  server, but its state and ownership are not established for destructive tests.
- **ADVERSARIAL:** A locally installed binary does not ensure fresh-machine or
  Linux reproducibility; a reused database could destroy user data; default
  PGlite cannot prove concurrent transaction behavior. Selection, lifecycle,
  CI, safety and actual integration tests are required before convergence.
- **CHANGE DELTA:** Initial document; not a convergence measurement.

### Missed Questions

1. Which distribution? Select the pinned Windows/Linux x64 binary packages
   above; their exact-version clean installs and native startup are required
   implementation gates. Other platforms fail with an explicit instruction.
2. Is container deployment active? The current README selects Vercel and the
   Fly runbook is explicitly historical. Remove obsolete packaging and repair
   live references; preserve dated records and do not claim hosted deployment.
3. Can the existing local cluster be reset? **No assumption:** create and
   identify a new run-owned cluster; do not touch the existing one.
4. Does native PostgreSQL fix the HTTP burst failure? **Resolved by
   measurement:** the failure came from PGlite's single connection allowing
   refill between serialized probes. `verify` passes real PostgreSQL to both
   HTTP suites, and the three-wide probe passes. A wider burst was rejected
   because it only exercised provider admission (40 admitted, 80 provider
   refusals, no paid refusal).

### Implementation Evidence

- `package.json` pins both platform packages at `17.11.0-beta.19` as
  optionalDependencies; a direct Linux devDependency fails `EBADPLATFORM` on
  Windows. `package-lock.json` contains both.
- `scripts/disposable-postgres.mjs` owns the lifecycle: it hydrates the
  package's own symlink map when npm blocks postinstall, creates a `mkdtemp`
  directory under ignored `.scratch/postgres`, writes a random 24-byte password
  file (removed after `initdb`), starts `pg_ctl` on 127.0.0.1 with an ephemeral
  port, authenticates and verifies `data_directory`, and deletes only a real,
  contained, marker-matched directory after a clean stop. Windows `pg_ctl` uses
  ignored stdio because a detached postmaster otherwise holds a pipe until
  timeout.
- `scripts/verify.mjs` starts one cluster for the sequential run, sets both
  test URLs, and closes it in `finally`, failing the run on cleanup failure.
  `postgres-concurrency-proof.mjs`, `http-suite/db.mjs`,
  `with-disposable-postgres.mjs` and `load-acceptance.mjs` use the same helper
  and endpoint guard.
- `DISPOSABLE_REMOTE_HTTP=yes` is the explicit opt-in for a non-loopback HTTP
  endpoint; `with-supabase-postgres.mjs` sets it for its generated database.
  The application-URL refusal and unverified-TLS refusal are unchanged.
- CI has no `services:` block. `repository-contract-check.mjs` requires the two
  pinned optional packages, rejects a CI container service and refuses the
  removed files.
- Removed `Dockerfile`, `.dockerignore`, `fly.toml` and
  `scripts/docker-entrypoint.sh`; current docs describe the native lifecycle,
  and historical Fly/SQLite records retain dated supersession labels.
- The HTTP probe is three-wide across 40 batches, under provider concurrency.
  A four-wave 30-wide burst was measured and rejected: 40 probes were admitted
  and 80 were refused by provider admission, with zero paid-scope refusals.

### Code Verification Evidence

`tests/disposable-postgres.test.mjs` exercises the lifecycle and refusals. The
callers above were exercised by the full verifier. `rg` finds `docker` only in
historical records, the changelog and the preserved operator notes; no current
script, CI workflow or setup step invokes it.

### Loop 2 — Independent audit and self-correction

- **RED:** A database provisioned only inside `test:postgres` does not reach
  the parent verifier or HTTP suite; an existing cluster is unsafe to reset.
- **GREEN:** Own one fresh cluster at the verifier boundary; validate ownership
  and use the same generated URL for the complete sequential run. Standalone
  consumers use the shared helper. Explicit URLs retain safety checks.
- **AUDIT:** `scripts/verify.mjs` copies only a pre-existing test URL;
  `.githooks/pre-push` invokes that verifier. Registry metadata confirms the
  pinned x64 packages and postinstall hooks. Current README identifies Vercel.
- **ADVERSARIAL:** Port races, cross-run deletion, unverified remote TLS,
  failed shutdown, skipped races and OS-user creation are explicit refusals or
  test obligations. Package and Linux execution still require real receipts.
- **CHANGE DELTA:** Documented per-pass character counts in the session output;
  no claim of implementation or a successful native-package install.

### Loop 3 — Final convergence

- **RED:** Package metadata does not prove that installation, symlink hydration
  or either platform's server lifecycle works. An HTTP failure cannot be
  attributed to PGlite without a real-PostgreSQL reproduction.
- **GREEN:** Make clean installs, actual startup, multi-connection behavior,
  cleanup and the real HTTP result explicit implementation acceptance gates.
  Preserve the existing assertion until its failure is diagnosed.
- **AUDIT:** Baseline `node --test tests/verify-summary.test.mjs
  tests/provisioning-tls.test.mjs` exits 0: 16 passed, zero skipped. The
  planned lifecycle test does not yet exist; its declaration is an obligation,
  not evidence. `npm view` confirms both exact-version packages exist.
- **ADVERSARIAL:** Verify no application or existing cluster is selected for
  reset; fail on ambiguous ownership. Windows and Linux execution receipts are
  required at implementation, and the historical Vercel receipt does not prove
  a future deployment. The design itself does not claim either success.
- **CHANGE DELTA:** The observed document lengths after successive edits were
  10,306, 11,079, 11,852, 12,378, 13,157, 13,169, 13,830, 14,664,
  14,474 and 15,446 characters. These are length differences, not measured
  Levenshtein distances; the per-pass distance cap has not been verified.

### Loop 4 — Implementation convergence

- **RED:** The Docker fallback failed every push; the HTTP probe failed on
  PGlite's single connection, and a wide burst only reached provider admission.
- **GREEN:** Pinned native lifecycle with an ownership guard; `verify` owns one
  cluster and supplies real PostgreSQL to both HTTP suites; the three-wide
  probe is retained; container packaging is removed.
- **AUDIT:** Lifecycle 9/9; seven real concurrency assertions; full verify 11/11,
  1,046 tests, 776 HTTP checks, recovery 14/14. Cleanup left no run directory.
- **ADVERSARIAL:** Clean install with scripts enabled, Linux execution, the
  load gate and hosted delivery are not observed and are named as limitations.
  Ownership refusal, occupied port and symlink escape are tested.
- **CHANGE DELTA:** Implementation commit `a3ed2a1`; no Linux or hosted receipt
  is claimed.

## Resolution

- **Convergence Date:** 2026-11-05
- **Fix Description:** development, push, CI and load workflows use a pinned
  native PostgreSQL 17 lifecycle instead of Docker, with loopback-only,
  ownership-marked cleanup. `verify` supplies that cluster to every sequential
  gate and both HTTP suites; the container packaging is removed.
- **Implementation Commit:** `a3ed2a1`
- **Archived:** yes —
  `dev/fids/archive/FID-2026-1105-002-docker-free-verification.md`.
- **Limitations:** Linux CI, a clean install with postinstall scripts enabled,
  the load gate and hosted delivery were not observed. No launch acceptance
  or deployment receipt is claimed.

## Lessons Learned

A documented alternative is insufficient when the default gate still invokes
an unavailable tool. The HTTP failure also showed that a single-connection
fixture cannot prove a shared token bucket, and that a burst wide enough to be
"concurrent" may only exercise a different gate. Pin the lifecycle, measure
which gate actually refused, and keep the probe inside the unrelated gate.
