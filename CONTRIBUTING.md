# Contributing

Savant Gateway is governed by the [ECHO Protocol v0.1.2 single-agent
contract](dev/echo-v0.1.2-single-agent.md), reached through
[ECHO-single-agent.md](ECHO-single-agent.md). Read [AGENTS.md](AGENTS.md) and
[protocol.config.yaml](protocol.config.yaml) before changing code. The harness
protocol in [ECHO.md](ECHO.md) is reference material, not the governing contract
for this repository.

## Setup

```bash
npm install
cp .env.example .env.local   # add PROVIDER_KEY
npm run dev
```

`npm install` wires `core.hooksPath` to `.githooks` and sets the commit template
through the `prepare` script. Finish the first provider sync and first request
with [docs/getting-started.md](docs/getting-started.md); common setup failures
are in [docs/troubleshooting.md](docs/troubleshooting.md).

## Before a Pull Request

```bash
npm run verify
```

That runs lint, typecheck, the production-config validator, tests, the 400-line
quality gate, the production build, both HTTP suites and the backup/restore
drill. The pre-push hook runs the same gates plus the attribution guard and
fails closed. Before a production deployment, run
`npm run config:check:prod`, which enforces the deployment inventory rather than
reporting the non-production pass.

## Rules

- Start non-trivial changes with a FID in `dev/fids/` using
  [templates/FID-TEMPLATE.md](templates/FID-TEMPLATE.md).
- No coding-agent credit anywhere. The attribution guard rejects commit
  messages that name an agent; CI re-checks the whole history.
- No secrets in the tree. Use `.env.local`, which is ignored.
- Commit in logical slices with a conventional subject and FID id.
- Do not force-push `main`.
- Keep files under 400 lines. Split by responsibility, not by arbitrary cuts.

## Reporting Problems

Use GitHub issues for reproducible bugs. Report security issues privately per
[SECURITY.md](SECURITY.md).
