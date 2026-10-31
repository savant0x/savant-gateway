# FID: Fixture capability coverage — a double must answer what it advertises

**Filename:** `FID-2026-1030-070-fixture-capability-coverage.md`
**ID:** FID-2026-1030-070
**Parent:** FID-2026-1030-048
**Severity:** medium
**Status:** verified
**Created:** 2026-10-31 00:20
**Automation level:** 2
**YAGNI-Compliance:** Verified

## Summary

Both HTTP test doubles could sit behind a provider row that advertised a
capability the double did not implement. Nothing checked that pairing, so the
gateway called the missing endpoint, the double tried to parse an empty body as
a completion, and the run died with a `SyntaxError` that named neither the
capability nor the endpoint. One probe now asserts the pairing for every
advertised capability, using the gateway's own parsers to judge the payload.

## Environment

- **OS:** Windows 11 host
- **Language/Runtime:** Node `v24.21.0`
- **Tool Versions:** npm `12.2.1`, better-sqlite3 `13.0.3`
- **Commit/State:** `928700c`

## Detailed Description

### Problem

The same defect appeared twice within an hour, in two different doubles:

```text
trial-http-suite: SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at IncomingMessage.<anonymous> (scripts/trial-http-suite.mjs:35:25)
```

The trial double answered `/subscription` and treated every other request as a
completion. The seeded provider row said `supports_balance = 1`, so the gateway
refreshed capacity with a `GET /balance`, which the double parsed as a
completion body. The stack trace pointed at a JSON parse three layers from the
cause, and the summary line named nothing useful.

The main harness double had the mirror-image problem before that: it answered
`/balance` correctly, but its provider row said `supports_balance = 0`, so the
endpoint was never exercised and a stale-observation bug hid behind a
configured fallback (FID-069). Both are capability/implementation mismatches,
and neither was detectable because nothing compared the two.

### Expected Behavior

A fixture that declares a capability obliges its double to answer that endpoint
with a payload the gateway accepts. When it does not, the gate fails with the
capability and the endpoint named, before any dependent check runs.

### Root Cause

The capability flags are consumed by production code
(`provider.capabilities.balance` gates `fetchProviderBalance`) while the doubles
are hand-written request handlers. The two were maintained by hand with no
assertion joining them.

### Evidence

RED, with the trial double answering its advertised `/balance` with `404`:

```text
red trial exit: 1
Error: the "mock" double answers /balance, which its provider advertises — expected 200, got 404
```

GREEN on both suites:

```text
http-suite: the "mock" fixture provider exists for the capability probe PASS
http-suite: the "mock" double answers /balance, which its provider advertises PASS
http-suite: the /balance payload satisfies the provider parser PASS
http-suite: 466 checks PASS
trial-http-suite: the "mock" double answers /subscription, which its provider advertises PASS
trial-http-suite: all checks PASS
```

## Impact Assessment

### Affected Components

- `scripts/http-suite/harness.mjs` — the probe and the endpoint table
- `scripts/http-suite.mjs` — probes the main double after seeding
- `scripts/trial-http-suite.mjs` — probes its double after capabilities settle

### Risk Level

- [x] Medium: the gate could pass while a double silently mismatched its
  declared capabilities, and the resulting failure mode was a crash that named
  neither.

## Proposed Solution

### Approach

`checkProviderDouble` reads `supports_balance` and `supports_subscription` for a
named provider row — the same flags production reads — and for each one that is
set it calls the matching endpoint with the serving credential, then feeds the
body to `parseProviderBalance` or `parseProviderSubscription`. Three properties
matter: the assertion is driven by the database rather than a hand-copied list,
the request carries the credential so a double that only answers
unauthenticated is caught, and acceptance is judged by the gateway's own parser
so a 200 with the wrong shape fails too.

The probe runs before any check that depends on the fixture, so a mismatch
reports its own cause instead of a downstream symptom.

### Steps

1. `implemented` — endpoint table and probe in `harness.mjs`.
2. `implemented` — main suite probes its double after `seedCatalog`.
3. `implemented` — trial suite probes after `refresh()` sets subscription support.

### Verification

Both suites, plus a negative run against a double that advertises an endpoint it
answers with `404`.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: quality
- gate: build
- gate: verify (http suite: both doubles)

### Verification Receipt

- verified: 2026-10-31T00:26Z
- lint: exit 0, zero warnings
- typecheck: exit 0
- quality: exit 0 — PASS, 295 files
- build: exit 0
- http suite: exit 0 — 466 checks (463 before the probe)
- trial suite: exit 0 — five probe checks, all pass

## Perfection Loop

### Loop 1 — RED

- **RED:** The first version of the probe used an unauthenticated `fetch`, and
  the harness double answers `/balance` with `401` without the provider
  credential. The check failed for the wrong reason, which would have taught the
  next reader that the double was broken.
- **GREEN:** The probe takes `apiKey` and sends the same `Bearer` header the
  gateway sends, so `401` is now a real signal rather than an artifact of the
  probe.
- **AUDIT:** Green on both suites; RED reproduced by answering an advertised
  endpoint with `404`, which failed with the capability and endpoint named.
- **ADVERSARIAL:** The probe cannot prove the *absence* of unadvertised
  endpoints, and it only covers the two capabilities the schema has today. That
  is the contract that exists, and the table is where a third one would be added.
- **CHANGE DELTA:** n/a — new record.

### Missed Questions

1. *Why not assert the inverse — that an unadvertised endpoint is not answered?*
   Nothing depends on it. A double may over-answer harmlessly; production only
   calls what the row advertises.
2. *Why not a unit test?* The doubles are request handlers defined inside the
   suite scripts. A unit test would either duplicate them or need a refactor to
   export them. The probe runs against the real double in the real suite, which
   is the artifact under test.
3. *Does this slow the gate?* Five extra local requests; the suite is dominated
   by process startup and page rendering.

### Implementation Evidence

- [x] **Commit SHA:** recorded in the follow-up receipts commit for this pass.
- [x] **File:line ranges:** `scripts/http-suite/harness.mjs:45-112` (table and
  probe), `scripts/http-suite.mjs:84-89` (call), `scripts/trial-http-suite.mjs:108`
  (call).
- [x] **Gate output:** lint, typecheck, quality, build and both suites exit 0.
- [x] **Reproducibility:** `node scripts/http-suite.mjs && node scripts/trial-http-suite.mjs`.
- [x] **Step statuses:** all three `implemented`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass with pasted output.
- [x] Production call-graph evidence: the probe reads the same capability flags
  `lib/providers/runtime.ts` reads before calling
  `fetchProviderBalance`/`fetchProviderSubscription`.
- [x] FID status matches the implementation state.

## Resolution

- **Closed Date:** not closed — commit receipt recorded in the follow-up commit.
- **Fix Description:** a capability-driven probe for both HTTP doubles.
- **Tests Added:** Yes — inside the two suites, so they run in `npm run test:http`.
- **Verification Evidence:** RED exit 1 with the named mismatch; GREEN exit 0 on
  both suites; repository gates exit 0.

## Lessons Learned

Both outages in this pass came from a fixture describing itself inaccurately —
one declared a capability it could not serve, the other denied one it did serve.
The cheap general fix was to stop describing and start comparing: the flags
production reads are now the ones the probe asserts.
