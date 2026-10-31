# Session Summary: 2026-10-31 NOWPayments live smoke

**Session ID:** 2026-10-31-nowpayments-live-smoke
**Status:** completed

---

## Initial State

### Environment

- **OS:** Windows 11, PowerShell
- **Language/Runtime:** Node v24 (runs TS directly)
- **Branch:** main
- **Last Commit:** `057f6c2` test(quota): pin disabled-trial invariants for daily-free proof (FID-049)

### Known Issues

- `.env.local` carried NOWPayments credentials under non-canonical names
  (`NOWPAYMENTS_PAYMENT_API_KEY`, `NOWPAYMENTS_IPN_API_KEY`) that the lane code
  does not read; the canonical contract is `NOWPAYMENTS_API_KEY` and
  `NOWPAYMENTS_IPN_SECRET` (`.env.example`, `lib/nowpayments.ts`).
- `NOWPAYMENTS_SANDBOX` was unset, which defaults to the live API host.
- `docs/project-status.md` is stale (says `main` at `c8669b5`; actual is
  `057f6c2`) — operator-maintained file, not touched.

### Dependencies

- NOWPayments lane (FID-076) implemented, verified and archived; code present on
  `main` (`lib/nowpayments.ts`, crypto topup route, IPN webhook, 15 unit tests,
  28 HTTP checks). Operator provided the credentials in `.env.local`.

---

## Planned Work

1. [x] Align `.env.local` NOWPayments names to the canonical contract.
2. [x] Confirm sandbox vs live for the key pair.
3. [x] Run a $1.00 invoice-creation smoke against the correct NOWPayments host.
4. [x] Leave `NOWPAYMENTS_TOPUPS_ENABLED` unset (lane disabled).

---

## Work Completed

### Task 1: Canonical env aliases

- **Status:** completed
- **Changes Made:**
  - `.env.local` (gitignored, never committed): added `NOWPAYMENTS_API_KEY`
    (copied from `NOWPAYMENTS_PAYMENT_API_KEY`) and `NOWPAYMENTS_IPN_SECRET`
    (copied from `NOWPAYMENTS_IPN_API_KEY`), preserving the original names.
    Values never printed, logged or committed.
  - `NOWPAYMENTS_SANDBOX` set explicitly: first `true` for a sandbox attempt,
    then `false` after the operator confirmed the key pair is live.
- **Verification:** `readNowpaymentsConfig` in the smoke script reported
  `configured=true` against the real `.env.local`.

### Task 2: Sandbox smoke attempt (rejected by NOWPayments)

- `createNowpaymentsInvoice` against `https://api-sandbox.nowpayments.io` with
  the operator key returned **403 Forbidden**. Config and URL resolution were
  correct; the key is not valid for the sandbox environment (FID-076 missed
  question 6: sandbox and live keys are separate).

### Task 3: Live smoke (operator-approved)

- **Status:** completed
- After the operator confirmed the key is a **live** key, `NOWPAYMENTS_SANDBOX`
  was realigned to `false` and the smoke reran against live.
- **Result:** PASS — invoice **id `5803921519`**, USD $1.00 fixed-rate,
  order id `smoke-1793470713976`, hosted URL
  `https://nowpayments.io/payment/?iid=5803921519`.
- The real client module was used (`createNowpaymentsInvoice` with `x-api-key`,
  `is_fixed_rate`, `is_fee_paid_by_user`); no secrets printed. Script lives in
  the temp dir only and was not committed.

### Task 4: Lane gate unchanged

- `NOWPAYMENTS_TOPUPS_ENABLED` remains unset, so the customer-facing checkout
  route still refuses (`crypto_topups_disabled`). Enabling the lane is the
  operator's launch decision.

---

## Issues Discovered

### Issue 1: Non-canonical env names in `.env.local`

- **Severity:** medium
- **Status:** resolved (aliases added; originals preserved)
- The code reads `NOWPAYMENTS_API_KEY`/`NOWPAYMENTS_IPN_SECRET`; the file had
  different names, which would have made the lane report "unconfigured" despite
  present credentials.

### Issue 2: Sandbox/live key environment mismatch

- **Severity:** medium
- **Status:** resolved by operator ruling (key pair is live; flag set `false`)
- First smoke attempt against sandbox returned 403. A sandbox key pair would be
  required to exercise `api-sandbox.nowpayments.io`.

---

## Validation Results

- Live invoice creation: **PASS** (`id=5803921519`, hosted URL returned).
- Sandbox invoice creation: FAIL (403) — expected per environment mismatch.
- No repo gates run: no tracked file changed in this session.

---

## Final State

### Code Changes

- **Files Modified (tracked):** 0
- **Changes:** `.env.local` only (gitignored; aliases + `NOWPAYMENTS_SANDBOX=false`)

### Git Status

- **Branch:** main, level with origin/main at `057f6c2`
- **Uncommitted Changes:** only operator-owned files (`docs/project-status.md`
  modified; `.cloud-attachments/`, `research/`, `docs/research/` untracked) —
  not staged.

---

## Open Questions

- Does the NOWPayments store's IPN callback URL and IPN secret match the
  `NOWPAYMENTS_IPN_SECRET` value in `.env.local`? A live paid invoice should be
  exercised end-to-end before the lane opens (webhook verification, fulfillment,
  replay).
- When should `NOWPAYMENTS_TOPUPS_ENABLED=true` be set? (Operator launch
  decision; also requires a canonical HTTPS origin via `resolveAppOrigin`.)
- FID-049 C3 provider-quota refresh scope; FID-044 open questions (free-share,
  reserve figures, refund policy, rate card); other operator-gated FIDs
  (059/060/061/062/066/045-LIVE).

---

## Next Session

### Priority Tasks

1. [ ] Operator: confirm NOWPayments store IPN callback + secret match, then
      decide lane enablement (`NOWPAYMENTS_TOPUPS_ENABLED`).
2. [ ] Exercise one real paid invoice through the gateway webhook (live IPN →
      signature verify → `fulfillTopup` → balance credit) before launch.
3. [ ] Resume FID-049 C3 scope decision and FID-044 open questions.

### Blockers

- Live end-to-end payment requires the operator to actually pay an invoice
  (operator territory per FID-076).
- Canonical HTTPS origin must be deployed/set for `resolveAppOrigin`.

### Notes

- Never print or commit NOWPayments credential values.
- `.env.local` is gitignored; operator files are never staged.
- The sandbox smoke script and live smoke script remain in the temp dir
  (`C:\Users\spenc\AppData\Local\Temp\opencode\nowpayments-*-smoke.mjs`).
