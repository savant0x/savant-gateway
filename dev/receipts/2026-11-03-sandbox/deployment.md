# Hosted deployment and provider proof

**Observed:** 2026-11-03T23:48Z
**FID:** FID-2026-1103-152
**Boundary:** redacted evidence only. No key value, session cookie, connection string, or payment credential is recorded.

## Source and deployment

| Item | Observed |
| --- | --- |
| GitHub branch | `main` |
| GitHub commit | `7e24f0e152b6dbe273dec83332a1dff3d19a46d2` |
| Local HEAD at observation | `7e24f0e` |
| Vercel production deployment | `savant-gateway-1kqrm056c-savantai.vercel.app` |
| Vercel state | `READY` |
| Vercel branch | `main` |
| Vercel commit | `7e24f0e152b6dbe273dec83332a1dff3d19a46d2` |
| Public origin | `https://savant-gateway.vercel.app` |

The Vercel deployment API and the deployed Admin Diagnostics page agree on the
commit and branch. The diagnostics page reports runtime `production`, Vercel
environment `production`, repository `savant0x/savant-gateway`, and a successful
storage read. The later evidence-only commit that contains this receipt changes
only FIDs, receipts and documentation; its runtime files are identical to
`7e24f0e`.

## Provider-key presence

| Provider | Key variable | Hosted presence | Enabled |
| --- | --- | --- | --- |
| Savant | `PROVIDER_KEY` | configured | yes |
| CommandCode | `COMMANDCODE_API_KEY` | **missing** | yes |
| Apixo | `APIXOAI_API_KEY` | missing | no |

Only presence is reported. The Admin Diagnostics page is the hosted evidence;
the local `deployment-local.json` explicitly says its own key flags describe the
plain shell environment, not Vercel.

**Open limitation:** CommandCode remains enabled in Production without
`COMMANDCODE_API_KEY`. It publishes zero models and cannot serve calls. The
operator must either add the key for Production and Preview and redeploy, or
disable the provider. This receipt does not change production configuration.

## Provider test and sync

Both actions ran against the deployed runtime at `7e24f0e`:

```text
test: 200 {"ok":true,"slug":"savant","models":44}
sync: 200 {"ok":true,"slug":"savant","imported":44,"free":11,"paid":23,
           "subscriptionOnly":10,"warnings":[],
           "balance":{"balanceUsd":0,"rpm":15,"rpmPlan":"free"},
           "subscription":{"mode":"free","plan":"FREE","unlimited":false,
           "tokenLimit":20000000,"tokensUsed":541911,
           "tokensRemaining":19458089,"allowed":true}}
```

The sync imported the complete catalog with no warnings. The upstream free-plan
allowance had 19,458,089 tokens remaining at observation; the provider balance
was `$0`.

## Gate and local-state notes

- `npm run verify` passed all ten gates, including `test:http`,
  `test:recovery`, `test:postgres` and `receipt:deploy`.
- The local deployment receipt reports `clean: false` because the receipt and FID
  closure files were being written and the preserved client chat export
  `freebuff-chat-2026-11-03T12-54-56.217Z.md` remains untracked. No source file
  outside this evidence slice changed.
- The local receipt reports provider-key flags `false` because it runs in a plain
  shell without `.env.local`; that is not hosted evidence and must not be read as
  a missing Vercel key.
- No real payment, funding, live price change, or production database reset was
  performed.
