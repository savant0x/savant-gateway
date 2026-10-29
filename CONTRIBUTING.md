# Contributing

Savant Gateway is governed by [ECHO Protocol v0.2.0](ECHO.md). Read
[AGENTS.md](AGENTS.md) and [protocol.config.yaml](protocol.config.yaml) before
changing code.

## Setup

```bash
npm install
cp .env.example .env.local   # add PROVIDER_KEY
npm run dev
```

`npm install` wires `core.hooksPath` to `.githooks` and sets the commit template
through the `prepare` script.

## Before a Pull Request

```bash
npm run verify
```

That runs lint, typecheck, tests, the 400-line quality gate, and the production
build. The pre-push hook runs the same gates plus the attribution guard and
fails closed.

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
