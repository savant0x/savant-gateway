# Quality pass — documentation and developer experience

Date: 2026-10-31. Scope: current-facing documentation, first-run and operator
walkthroughs, the production-config gate, and one false admin label. This is not
a runtime or financial audit; the systems review and launch FIDs own those
boundaries.

No new FID was allocated. Master FID-043's twenty slots are allocated, so these
are follow-ups under the owning records: FID-2026-1030-057 (deployment and gate
truth), FID-2026-1030-056 (customer/operator copy), FID-2026-1030-061 (policy
version in the support runbook) and FID-2026-1031-071 (archived-child links).

## Findings

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | README, `AGENTS.md`, `docs/launch-plan.md` and `docs/database-options.md` still said SQLite was a local-development placeholder that had to be replaced, while the selected topology is one persistent process on a local volume. README also said the build was "not deployable." | README, AGENTS and the launch plan now describe the selected topology; the launch-plan Phase 3 Vercel analysis and database-options are labelled superseded history. README's current limit is "Not deployed," naming the unbuilt image and missing volume. |
| 2 | High | `npm run config:check` reported `PASS (non-production)` unless `NODE_ENV=production`, but `docs/deployment-runbook.md` called it the operator gate that passes only with the production inventory. The documented gate did not enforce the inventory. | Added `npm run config:check:prod`, which forces production mode, and used it in the deployment runbook. The non-production form remains the local/`verify` check and is documented as such. |
| 3 | Medium | The pre-push hook and CI did not run the config check even though README described the hook and CI as running the same gates as `verify`. | Added `npm run config:check` to both after typecheck, before the tests. |
| 4 | Medium | `CONTRIBUTING.md` said ECHO Protocol v0.2.0 (`ECHO.md`) governed the repository, contradicting `AGENTS.md`, `protocol.config.yaml` and the boot marker. | It now names the v0.1.2 single-agent contract and calls `ECHO.md` reference material. |
| 5 | Medium | The support runbook described policies `v1` as current after `v1.1` was published, and named `content/legal/v1/` as the served text. | It now names `v1.1`, `content/legal/v1.1/`, and the permanent v1 route. |
| 6 | Medium | The admin credit card said checkout and customer self-service top-ups were "not implemented," while `/api/account/topup`, Stripe Checkout and the account top-up card exist. | The copy now says customer top-ups use Stripe Checkout when configured, and the operator grant path does not require Stripe. |
| 7 | Medium | README's last full receipt was stale (312 tests, 423 HTTP checks) against the current 326/466 receipt. | Updated to the FID-058 receipt, including the recovery drill. |
| 8 | Low | Current links were broken: `docs/deployment-runbook.md` pointed at `../../.env.example` and a `dev/...` session summary from inside `docs/`; master FID-043 linked archived children 048 and 050–055 at active paths. | Corrected the paths and archived-child links. |
| 9 | Low | There was no single local first-run walkthrough, operator-console checklist, troubleshooting guide or documentation index; README's docs table omitted the deployment runbook. | Added `docs/README.md`, `docs/getting-started.md`, `docs/operator-first-run.md` and `docs/troubleshooting.md`, and expanded the README table. |
| 10 | Low | `dev/tracking/internal-followups.json` cited `docs/deployment-runbook.md:242`, a line number that will drift. | Replaced it with the `#backup-and-restore` anchor. |

## Verification

Run from the working tree:

```text
npm run check
  eslint . ......................... exit 0
  tsc --noEmit ..................... exit 0

npm test
  tests 326, pass 326, fail 0, duration 1568.7 ms

npm run build
  production build exit 0; 18 static/SSG pages generated

npm run quality
  PASS (400-line ceiling, 295 files scanned)

node scripts/attribution-guard.mjs
  PASS (no coding-agent credit found)

npm run config:check
  config-check: PASS (non-production)  exit 0

npm run config:check:prod   (no inventory)
  origin_missing, db_missing, admin_unconfigured  exit 1

npm run config:check:prod   (synthetic HTTPS origin, absolute DB path,
                             admin values of sufficient length)
  config-check: PASS (https://gateway.example.com)  exit 0

markdown link scan, current roots
  33 Markdown files (README, AGENTS, CONTRIBUTING, docs/, master FID, this
  report); 0 broken links.

markdown link scan, full workspace
  168 Markdown files; 20 failures, all historical archive/audit links that kept
  their pre-move relative depth.
```

The full `npm run verify` was not rerun for this pass: no route, schema,
settlement or HTTP-suite behavior changed. The prior FID-058 receipt (326 unit
tests, 466 HTTP checks, build, recovery drill) remains the last full gate run.
The changed admin copy is lint, typecheck and production-build clean; the config
entry point was exercised in both modes above.

## Residual gaps

- The first image build, first Fly deployment and first timed restore on the
  production volume remain blocked at the Fly account boundary. The local Fly
  CLI is at `~/.fly/bin/flyctl.exe`; `fly apps list` exits 1 with "trial has
  ended, please add a credit card," and no app or volume exists. Tracked as
  `FID-2026-1030-058-LIVE` and `FID-2026-1030-067-DEPLOY`.
- Historical audit and archived-FID links retain their original relative depth.
  They were not rewritten: those records describe the tree they were written
  against, and changing them is not needed to operate the current tree.
- No email delivery, live Stripe payment, funded paid inference or production
  proxy acceptance exists. None of those is claimed by this pass.
- `/dashboard` remains a development-only loopback console; production redirects
  it to `/admin/login`.
