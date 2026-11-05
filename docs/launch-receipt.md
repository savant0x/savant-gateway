# Launch acceptance receipt

> **Current contract (2026-11-03).** Gate: `npm run receipt:launch`. The receipt
> is an operator observation record, not an automated test result. A green
> fixture suite never satisfies it.

The automated gates prove regression, concurrency, recovery and bounded load
against disposable services. They do not prove a real customer journey against
hosted payment, the hosted database or the alert destination. FID-2026-1103-127
defines that final boundary, and FID-2026-1030-062 owns the launch blockers this
receipt discharges.

> **Operator ruling 2026-11-04 — funded inference is not required.** Verbatim:
> "no, let me be clear, i do not have a sandbox, im not going to fund a wallet to
> light money on fire to satisfy some made up requirement i did not make."
> The receipt therefore has five required items. No provider wallet is funded
> for testing, and no funded paid call, top-up or sandbox receipt is claimed.
> Funded inference remains unverified; it is not converted into a pass.

## Record file

Write `dev/acceptance/launch-receipt.json` (or pass `--file`). The command never
creates the file and never fills a missing value.

```json
{
  "schema": 1,
  "pinnedSha": "<40-character commit SHA>",
  "items": {
    "payment": {
      "status": "pass",
      "observedAt": "2026-11-03T12:00:00.000Z",
      "operator": "<name>",
      "evidence": ["invoice id", "webhook event id", "replay refusal"],
      "notes": "optional"
    }
  },
  "approval": {
    "decision": "go",
    "decidedAt": "2026-11-03T12:30:00.000Z",
    "operator": "<name>",
    "sha": "<the same pinned SHA>",
    "cohort": "8 concurrent customers",
    "spendCapUsd": 25,
    "statement": "optional, non-secret"
  }
}
```

## Required items

| ID | Evidence that counts |
| --- | --- |
| `payment` | A real hosted checkout completed; the provider-signed event was delivered; a replay was refused; the ledger agrees. |
| `recovery` | A backup restored into a disposable hosted database and the ledger equation re-checked. |
| `alert` | The monitor delivered a signed alert to the operator destination and an incident was recorded. |
| `load` | The approved envelope was measured without unresolved admissions or ledger differences. |
| `rollback` | Admission paused, traffic drained, the previous artifact restored, and financial history not rewound. |

The five items are `payment`, `recovery`, `alert`, `load` and `rollback`. Each
item needs `status` (`pass` or `fail`), `observedAt`, `operator` and at least one
non-empty `evidence` string. A `fail` blocks; a missing item makes the receipt
incomplete. The approval must be an explicit `go` for the pinned SHA, cohort,
spend cap and operator. Silence is not approval, and a receipt pinned to another
commit is stale.

## Redaction

The validator rejects a receipt that contains a configured secret value
(`ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `PROVIDER_KEY`,
`COMMANDCODE_API_KEY`, `DATABASE_URL`, `DB_CONNECTION_STRING`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NOWPAYMENTS_API_KEY`,
`NOWPAYMENTS_IPN_SECRET`, `SUPABASE_API_KEY`) or an unmistakable credential
shape (`sk_live_`, `sk_test_`, `whsec_`, a URL with embedded user:password,
`Bearer <token>`, a private-key block). Reports name the JSON path, never the
value. Use request ids, invoice ids, event ids and redacted URLs instead.

## Commands

```bash
npm run receipt:launch                       # human verdict, exits 1 unless complete
npm run receipt:launch -- --json             # machine-readable verdict
npm run receipt:launch -- --head <sha>       # pin explicitly when HEAD is unavailable
```

A missing file reports `INCOMPLETE` with every item listed as missing. That is
the expected result until the operator performs the observations; the repository
does not ship a placeholder receipt.
