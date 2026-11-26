# FID: Identity calibration lab and measured certificate

**Filename:** `FID-2026-1110-002-identity-calibration-lab.md`
**ID:** FID-2026-1110-002
**Severity:** high
**Status:** fixed
**Created:** 2026-11-10 19:32 EST
**Automation level:** 3
**YAGNI-Compliance:** Verified

> This record is **`fixed`, not `converged`**: steps 1–4 are implemented and
> committed (`d66a538`, `b884984`, `1f75c44`, and step 4's arm registry and
> loopback proxy at `495e8b3`, whose wrapper script landed under
> FID-2026-1122-001). The `converged` metadata it carried until 2026-11-26 no
> longer described the tree. The frozen `aio-identity-v3` candidate, its
> manifest seal, the exact bounds, the power proof, the per-cell betting
> e-process, the simulated drift calibration, the arm registry and the loopback
> adversary exist. Steps 5–9 — collection, compute/issue,
> activation/consumption and publication — do not, and none can start without an
> operator-supplied upstream, credential and two declared routing model ids.
> No inference, payment, provider transfer or publication is authorized or
> claimed.

---

## Summary

The identity lane shipped without the evidence foundation it depends on.
`lib/identity/fingerprint.ts:105-114` decides that a route is `consistent` when
the bootstrap upper bound of the mean JSD is at most `1.5 × noise`, and
`divergent` when the lower bound exceeds `3 × noise`. `noise` is the larger of
the two split-half spreads and a `0.01` floor (`fingerprint.ts:95-99`). The two
multipliers are sealed constants (`lib/identity/battery.ts:28-29`), and the
record that introduced them says plainly: "They are replaced by a calibration
certificate in a later protocol; this FID does not claim a calibrated
false-positive rate."

No such certificate exists. A search of the identity modules for
`calibration` or `certificate` returns zero matches, and the `identity` schema
stores protocols, references, runs, samples, findings, verdicts and corrections
only (`lib/storage/schema/identity.ts`). The only measured quantity in the
decision is the reference's own split-half spread, which cannot estimate how
often an honest route is called divergent.

The research review makes the calibration lab the first dependency, not an MVP
(`docs/research/aio-source-review.md:1140`, §7 row 1), and gives it its own
record in the revised build path (§12.6 step 5, line 1291 onward). This FID is
that record: a sealed, API-only, free-quota calibration harness that measures
the false-positive rate and the per-class true-positive rate of the detectors
that actually ship, emits a certificate bound to the protocol hash and detector
version, and makes a public `consistent` result impossible without one.

Registration surfaced two arithmetic defects in the review's acceptance gate.
Both are corrected here because a certificate that cites an unattainable sample
size is not a certificate:

1. **Twenty positives per class cannot prove TPR ≥ 0.90 at 95% confidence.**
   The Wilson lower bound at 20/20 is **0.8389**; it first reaches 0.90 at
   **35/35 (0.9011)**. The minimum is 35 held-out positives per class with zero
   misses, not 20.
2. **Four hundred verdict-level control comparisons cannot run on free quota at
   a defensible cadence.** One full target arm is 193 requests
   (`lib/identity/battery.ts` `REQUEST_COUNTS`), so 400 comparisons is 77,200
   requests ≈ **128.7 h** at the default 10 RPM. The fingerprint detector's own
   unit is 120 requests (`CONTROL_REQUESTS`), and the whole matrix is 44,910
   requests ≈ **74.85 h** at 10 RPM (≈ 12.47 h at the 60 RPM ceiling), which
   fits inside the 7-day reference TTL with margin.

## Environment

- **OS:** win32 (Windows 11), bash via Git Bash.
- **Language/Runtime:** TypeScript 5.9 strict; Node 24.x pinned by
  `package.json` engines and `.nvmrc`; npm.
- **Tool Versions:** Next.js 16 App Router; PostgreSQL 17, PGlite locally; `pg`.
- **Commit/State:** `main` at the session start, with two pre-existing dirty
  research files (`research/AI Inference Reseller Strategy.md` modified,
  `docs/research/Wholesale AI Inference Reseller Market.md` untracked). This
  record touches neither.
- **Live lane:** FID-2026-1101-087 is `verified`; `lib/identity/*` contains 36
  modules and seven test suites (`tests/identity-*.test.mjs`).

## Detailed Description

### Problem

A published `consistent` verdict currently says the target matched a stored
reference on the tested cells. It does not say how often the detector makes that
statement when nothing is wrong. The split-half noise term measures the
reference's internal variability, not the detector's error rate, and the
multipliers were chosen so that the rule is conservative-looking, not so that it
has a known size.

Three concrete consequences:

- **The FPR is unknown but publishable.** `decideVerdict` can return
  `consistent` (`lib/identity/verdict.ts`) and the operator can publish it with
  no certificate, because none is required anywhere in the path.
- **The TPR is unknown per failure class.** The canary, context, tool and
  fingerprint gates each produce independent findings, but no run has measured
  how often each gate fires on a route that actually has that defect.
- **The control rule is also uncalibrated.** `runner-verdict.ts:137` requires
  the target-to-control mean JSD to exceed the target-to-reference mean by
  `2 × noise`; `controlMultiplier` is a fourth invented constant in the same
  block.

### Expected Behavior

1. A sealed manifest fixes the protocol candidate, detector version, arm
   definitions, sample sizes, held-out split, seeds and the acceptance rule
   **before** the first probe is sent.
2. The lab runs the sealed battery against control arms and per-class positive
   arms collected through APIs only. It spends no operator credit and uses free
   models or free quota.
3. It computes, per detector, the count of false positives and per-class true
   positives with exact 95% bounds, and writes the raw counts plus a
   recomputation command.
4. It issues a certificate only when the pre-registered rule is met: FPR 95%
   upper bound ≤ 0.01 and TPR 95% lower bound ≥ 0.90 for every class the
   certificate claims.
5. The certificate is stored in the `identity` schema and bound to the protocol
   hash, detector version and manifest hash. Changing any of them voids it.
6. A `consistent` or `divergent` verdict refuses to be produced or published
   without an active, unexpired certificate whose scope covers the claim; the
   run degrades to `inconclusive` with a named reason instead.
7. The methodology page states the certificate date, α, measured bounds, the
   classes covered, and the classes that cannot be covered through APIs.

### Root Cause

The lane was built detector-first. FID-2026-1101-087 delivered the probe
battery, evidence store, runner and public panel, and left the statistical
decision rule as a sealed placeholder with an explicit note that calibration
comes later. The protocol seal hashes `DECISION`, so a constant cannot be edited
in place — but nothing forces a re-sealed constant to be measured either. A new
version can carry a new guess and still verify.

The research review's own gate could not repair this by itself: it asks for
400 control comparisons and 20 positives per class, and neither number survives
arithmetic (see Summary). A lab built to that spec would spend 128.7 h and still
be unable to certify a 0.90 TPR lower bound at 20/20.

### Evidence

```text
$ rg -i "calibration|certificate" lib/identity
(no matches)

$ sed -n '25,33p' lib/identity/battery.ts
export const DECISION = {
  minSamplesPerCell: 10,
  minComparableCells: 4,
  consistentMultiplier: 1.5,
  divergentMultiplier: 3,
  noiseFloor: 0.01,
  controlMultiplier: 2,
  ttlDays: 7,
} as const;

$ sed -n '104,114p' lib/identity/fingerprint.ts
      interval.high !== null &&
      interval.high <= DECISION.consistentMultiplier * noise
    ) {
      state = "consistent";
    } else if (
      interval.low !== null &&
      interval.low > DECISION.divergentMultiplier * noise
    ) {
      state = "divergent";
    }
```

The sample-size arithmetic, recomputed by command rather than asserted:

```text
$ node -e '<Wilson lower bound and zero-event binomial upper bound>'
wilson 20/20 0.8389
wilson 35/35 0.9011
wilson 45/45 0.9213
fpr upper 0/299 0.00997
fpr upper 0/35 0.0820

$ node -e '<request matrix from REQUEST_COUNTS and CONTROL_REQUESTS>'
controls 299 x 120 = 35880
substitution 35 x 120 = 4200
version swap 35 x 120 = 4200
hidden prompt 35 x 6 = 210
context truncation 35 x 6 = 210
phantom tool 35 x 6 = 210
total 44910 requests; 74.85 h at 10 RPM; 12.47 h at 60 RPM
400 verdict-level arms x 193 = 77200 requests; 128.7 h at 10 RPM
```

## Impact Assessment

### Affected Components

New:

- `lib/identity/calibration/manifest.ts` — canonical manifest, held-out split,
  acceptance rule, SHA-256 seal.
- `lib/identity/calibration/arms.ts` — arm registry and per-class detector map.
- `lib/identity/calibration/bounds.ts` — Wilson, exact binomial upper bound,
  rule of three, and the acceptance predicate.
- `lib/identity/calibration/power.ts` — minimum n for the TPR/FPR targets and
  the pre-registration check.
- `lib/identity/calibration/delta.ts` — posterior predictive δ calibration and
  the simulation receipt.
- `lib/identity/calibration/certificate.ts` — build, validate, scope check,
  content hash.
- `lib/identity/calibration/consume.ts` — map a valid certificate to the
  decision constants and the claim scope.
- `lib/identity/stats/betting.ts` — the per-cell e-process (log-wealth,
  previsible estimator, wealth threshold).
- `scripts/identity-calibration.mjs` — operator CLI: dry run, collect, compute,
  issue, verify, activate.
- `scripts/identity-calibration-proxy.mjs` — loopback adversary that forwards to
  a real upstream and applies one declared transform per arm.
- `lib/identity/store/certificates.ts` — read/write/activate the certificate.
- `tests/identity-calibration-bounds.test.mjs` (exists)
- `tests/identity-calibration-proxy.test.mjs` (exists)
- the certificate suite (step 6) and the consumption suite (step 7) are named in
  this plan but are not written

Changed:

- `lib/storage/schema/identity.ts` — `identity.calibration_certificates`.
- `lib/identity/battery.ts` — protocol `aio-identity-v3`; the four multipliers
  become certificate-supplied constants, and the v3 seal includes the manifest
  hash.
- `lib/identity/protocol.ts` — seal `calibrationManifestSha256`; refuse a
  protocol whose certificate is absent or mismatched.
- `lib/identity/fingerprint.ts` — accept decision constants as an argument
  instead of importing them from `DECISION`.
- `lib/identity/verdict.ts` and `lib/identity/runner-verdict.ts` — require a
  certificate for `consistent` / `divergent`; named `inconclusive` reasons
  otherwise.
- `lib/identity/view.ts` and the `/identity` methodology copy — certificate
  date, α, bounds, covered and uncovered classes.
- `lib/identity/create.ts` — refuse to create a run whose protocol has no active
  certificate when the requested mode is `verify`.
- `lib/identity/public-view.ts` — no change to the published shape; the
  certificate supplies the limits text.

Read-only reuse: `lib/identity/probe-client.ts` (injected fetch, rate limiter,
retry taxonomy), `lib/identity/estimate.ts`, `lib/identity/store/*`,
`lib/identity/stats/{jsd,intervals,split-half}.ts`.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

High because the artefact is a public trust claim and a certificate that is
issued on a weak or self-selected arm set would make the claim stronger without
making it truer. The lane stays isolated from admission, credit and settlement,
so a calibration failure degrades the panel, not the gateway.

## Proposed Solution

### Approach

The certificate is the unit of evidence. It certifies **one detector version**
against **one sealed protocol candidate** on **held-out arms**, and it records
the raw counts, the exact bounds, the arm set, and the limits. Nothing in the
production path may invent a threshold that the certificate does not carry.

The 0.01 false-positive bound is a property of the decision rule, not of the
number of control runs observed:

- Each fingerprint cell runs an anytime-valid e-process at
  `α_cell = 0.01 / 6 = 0.0016667`, so its rejection threshold is wealth ≥ 600.
- A verdict rejects if any of the six cells rejects; the union bound bounds the
  verdict-level FPR by 0.01 under a correct reference distribution.
- The control run is a **falsification check**, not the source of the bound.
  It must observe zero false positives in 299 comparisons, whose exact 95%
  upper bound is 0.00997. Any observed false positive blocks the certificate and
  triggers root-cause analysis; it never triggers a threshold change on the same
  data.

This record therefore replaces the invented JSD multipliers with the e-process
as the decision rule. Empirically calibrating the multipliers cannot produce a
0.01 bound: the best a 299-control run can say about any observed rule is the
count it observed, and the multipliers have no construction that ties them to α.
JSD stays as the reported effect size.

The control-discriminative rule is measured rather than guessed. Instead of
`mean + 2 × noise` (`lib/identity/runner-verdict.ts:137`), the manifest fixes the
5th percentile of the target-to-control mean-JSD difference observed on the
control arm; a control that does not clear that pre-registered margin makes the
run `inconclusive`, as before.

The true-positive bound is empirical and per class, because no construction
gives it. The lab pre-registers 35 positives per class and accepts only a
35/35 result for a claimed 0.90 lower bound. A miss requires a new protocol
candidate measured on **fresh** held-out positives, never a re-read of the same
arm set.

**Per-class detector map and cost.** TPR is measured for the gate that is
supposed to detect the class, not for the aggregate verdict.

| Class | Detector | Requests per positive | 35 positives |
| --- | --- | --- | --- |
| Substitution (different family, claimed route) | Fingerprint | 120 | 4,200 |
| Version swap (older sibling checkpoint) | Fingerprint | 120 | 4,200 |
| Hidden system prompt | Canary | 6 | 210 |
| Context truncation | Context ladder | 6 | 210 |
| Phantom tool / rewritten call | Tool conformance | 6 | 210 |

Two fingerprint classes plus three gate classes cost 9,030 requests. The 299
control comparisons cost 35,880. The matrix is 44,910 requests: 74.85 h at the
default 10 RPM, 12.47 h at the 60 RPM cap, and about 3.1 days at default, which
fits inside the 7-day reference TTL. A second full matrix would not fit, so the
TTL is a hard scheduling constraint, not a footnote.

**Arms that cannot be honest through APIs.**

- Quantization (FP16 vs Q4/Q8) is `not_tested`. There is no ground-truth
  deployment and no logprob reference for most routes. The certificate says so.
- Weight authenticity is never claimed.
- A version swap between two behaviourally identical checkpoints is not
  detectable by a black-box battery. If the pair does not separate at the
  pre-registered power, the class is recorded `not_separable` and no TPR is
  claimed for it.

**Hold-out discipline.** The manifest fixes the arm ids, the paraphrase seed,
the cell order, the sample sizes and the acceptance predicate before the first
request, and its SHA-256 is written into the protocol seal. The arms used to
choose the candidate constants are the **design set**; the reported arms are a
**disjoint held-out set** with fresh nonces and fresh collection timestamps.
Re-using a design arm in the reported set voids the certificate.

**Single-provider limit.** If no second trusted endpoint serves the model, the
only available reference is the route's own baseline, which FID-087 correctly
labels `self_consistent`. In that case the certificate certifies the
`self_consistent` decision only; the `consistent` claim stays `unsupported` for
that route. The certificate's `scope` field names the claim it covers, and the
verdict path compares it against the reference provider at verdict time.

### Steps

1. **Pre-register the candidate.** Create `aio-identity-v3` with the battery
   unchanged, `calibrationManifestSha256` in the seal, the e-process constants
   (`α`, `λ`, `δ`, wealth threshold) and the certificate-supplied multipliers.
   Run `power.ts` to prove 35 positives and 299 controls meet the targets at the
   pre-registered effect size. Freeze the manifest and record its hash. No probe
   is sent before this step completes.
2. **Implement the pure statistics.** `bounds.ts` (Wilson lower, exact binomial
   upper, rule of three, the acceptance predicate), `power.ts` (minimum n), and
   `stats/betting.ts` (log-wealth with a previsible estimator, `<other>` floor,
   anytime-valid stopping). Unit tests cover the four published numbers above
   and the boundary cases (0 successes, all successes, n = 0, wealth exactly at
   the threshold).
3. **Calibrate δ.** `delta.ts` runs the posterior predictive simulation from
   §6.3: Dirichlet(reference + Jeffreys 0.5), ±8% benign drift, horizon equal to
   the maximum budget, the smallest δ that keeps the trajectory under
   `1/(α × margin)`, max over simulations × 1.3, clamped to [0.005, 0.5]. The
   simulation's seed, draw count and resulting δ are written into the manifest.
   The chosen δ must be frozen before any held-out arm is collected.
4. **Build the arm harness.** `arms.ts` + `scripts/identity-calibration-proxy.mjs`.
   The proxy listens on loopback, forwards every request to a configured real
   upstream with the provider credential from the environment, and applies
   exactly one declared transform: inject a system message (`hidden_prompt`),
   truncate the message before forwarding (`context_truncation`), rewrite a tool
   name to a phantom (`phantom_tool`), or route to a declared different upstream
   id (`substitution`, `version_swap`). It binds `127.0.0.1` only, rejects a
   non-loopback `Host`, sets `redirect: "error"` and `cache: "no-store"`, keeps
   the credential in memory only, and records a per-arm transform receipt with
   the transform hash. It never fabricates model output.
5. **Collect.** `scripts/identity-calibration.mjs collect` runs the sealed arms
   through the existing probe client, with the global rate limiter, the existing
   retry taxonomy and the existing sample idempotency. Free models only. No
   ledger, credit or customer table is touched. It writes raw counts and a
   per-arm coverage table; a skipped probe is never a pass.
6. **Compute and issue.** `compute` builds the confusion matrices, the exact
   bounds and the per-class coverage; it refuses to issue unless the
   pre-registered acceptance predicate is met. `issue` writes the certificate
   with `active = 0`, its content hash and `expires_at = issued_at + 90 days`.
   The 7-day reference TTL governs the matrix run, not the certificate's life;
   a new protocol, detector version or manifest hash voids the certificate
   immediately, and the quarterly review in §7 row 10 re-issues it.
7. **Activate and consume.** `activate` is an explicit operator action that
   flips one certificate active for `(protocol_id, detector_version)`. The
   verdict path loads it, checks protocol hash, detector version, manifest hash,
   expiry and scope, and passes its constants into `compareFingerprint`. A
   missing or invalid certificate makes every fingerprint-derived status
   (`self_consistent`, `consistent`, `divergent_review`) `inconclusive` with the
   exact reason; `baseline`, `unsupported` and `error` are unaffected.
8. **Publish the method.** The `/identity` page shows the certificate date,
   α, measured FPR upper bound, per-class TPR lower bounds, the uncovered
   classes (quantization, weight authenticity, non-separable version pairs) and
   the arm set hash. The public model panel keeps the existing advisory wording
   and adds "calibration certificate {date}" without exposing raw samples.
9. **Verify and record.** Run the declared gates, produce a sealed receipt with
   the manifest hash, the raw counts, the recomputation command and the observed
   bounds, commit, and close only when the receipt shows a met predicate and the
   certificate is active for the shipped detector.

### Verification

- `tests/identity-calibration-bounds.test.mjs` recomputes 20/20 = 0.8389,
  35/35 = 0.9011, 0/299 = 0.00997, and rejects a 34-positive certificate.
- The certificate suite (step 6, not yet written) must prove the manifest seal,
  the held-out disjointness check, content-hash validation, scope matching and
  the refusal path for every mutated field.
- The consumption suite (step 7, not yet written) must prove that a `consistent`
  verdict is impossible without an active certificate and that a stale,
  mismatched or wrong-scope certificate degrades to `inconclusive`.
- `tests/identity-calibration-proxy.test.mjs` proves each transform is applied
  exactly once, forwarded content is unchanged, and the transform receipt
  matches the declared arm.
- A live free-quota receipt under `dev/receipts/` records the manifest hash, the
  44,910-request matrix (or the exact reason a class was skipped), the measured
  FPR/TPR, and the activation.

Honest boundary: a certificate is evidence about the arms that were run. A
passed certificate does not prove the detector is optimal, does not cover a
model family absent from the arms, and does not transfer to a new battery. The
`limits_json` field and the methodology page say so in the issued artefact.

### YAGNI

No new dependency, no new document, no public runner, no admin UI, no paid
model run, no local model weights. One table, one CLI, one loopback proxy, four
test files. The battery is unchanged; only the decision constants and their
provenance change.

## Verification Gates

Run at registration (2026-11-10):

- gate: repository:check — `npm run repository:check`, for the active-FID
  registration, ID/filename equality, status and root-link contract.
- gate: attribution — `npm run attribution`, because this record is inside the
  governed document surface.

Run for step 3 (2026-11-12, commit `1f75c44`):

- gate: lint — `npm run lint`, zero warnings. PASS.
- gate: typecheck — `npm run typecheck`. PASS.
- gate: test tests/identity-calibration-bounds.test.mjs — 26/26 pass, zero
  skips (7 δ cases added).
- gate: quality — `npm run quality`, PASS (400-line ceiling, 694 files).
- gate: test — `npm test`, 1,144 pass / 0 fail / 16 environment-gated skips
  (1,160 total).
- gate: attribution — the commit hook ran the guard: PASS.

Run for step 2 (2026-11-12, commit `b884984`):

- gate: lint — `npm run lint`, zero warnings. PASS.
- gate: typecheck — `npm run typecheck`, `next typegen && tsc --noEmit`. PASS.
- gate: test tests/identity-calibration-bounds.test.mjs — 19/19 pass, zero
  skips (the 10 step-1 cases plus 9 e-process cases).
- gate: quality — `npm run quality`, PASS (400-line ceiling, 693 files).
- gate: test — `npm test`, 1,137 pass / 0 fail / 16 environment-gated skips
  (1,153 total).
- gate: attribution — the commit hook ran the guard: PASS.

Run for step 1 (2026-11-11, commit `d66a538`):

- gate: lint — `npm run lint`, zero warnings. PASS.
- gate: typecheck — `npm run typecheck`, `next typegen && tsc --noEmit`. PASS.
- gate: test tests/identity-calibration-bounds.test.mjs — 10/10 pass, zero
  skips. Covers the four published numbers, the rejection paths, the frozen
  manifest hash and the v3 seal.
- gate: quality — `npm run quality`, PASS over 692 files; `lib/identity/` is in
  the 400-line scan.
- gate: test — `npm test`, 1,128 pass / 0 fail / 16 environment-gated skips
  (1,144 total, including the 10 new tests).
- gate: repository:check — re-run after the FID receipt: `PASS (Node 24, 12
  gates, 11 active FIDs, root links and current docs consistent)`.
- gate: attribution — re-run after the FID receipt: both guards PASS.Run for step 4 (2026-11-13, working tree at `52eab59`):

- gate: lint — `npm run lint`, zero warnings. PASS.
- gate: typecheck — `npm run typecheck`. PASS.
- gate: test tests/identity-calibration-proxy.test.mjs — 13/13 pass, zero
  skips, including a real loopback forward against a stub upstream and a
  forged non-loopback `Host` refusal.
- gate: quality — `npm run quality`, PASS (400-line ceiling, 696 files).
- gate: verify — `npm run verify`, 12/12 gates PASS, 1,173/1,173 tests,
  PostgreSQL 20/20, 156.4 s at `52eab59` with the step-4 files in the tree.

Pending for steps 5–9 (those paths do not exist yet, so they are not declared
gates until the steps land):

- certificate suite (step 6) — not written.
- consumption suite (step 7) — not written.
- gate: build — required once the certificate path is wired into the app.
- gate: verify — the full set, only after the matrix receipt and the feature
  gates both pass.

### Verification Receipt

**Registration (2026-11-10T19:32:00-05:00):**

- repository:check: exit 0 — `repository-check: PASS (Node 24, 12 gates, 12
  active FIDs, root links and current docs consistent)`.
- attribution: exit 0 — `attribution-guard: PASS (no coding-agent credit
  found)` and `attribution-document-guard: PASS (no governed credit line)`.

**Step 1 (2026-11-11, commit `d66a538`):**

- lint: exit 0, zero warnings.
- typecheck: exit 0.
- `node --test tests/identity-calibration-bounds.test.mjs`: 10/10 pass, 0 fail,
  0 skipped.
- quality: PASS, 692 files under the 400-line ceiling.
- `npm test`: 1,128 pass / 0 fail / 16 environment-gated skips.
- repository:check: exit 0 — `PASS (Node 24, 12 gates, 11 active FIDs, root
  links and current docs consistent)`.
- attribution: exit 0 — both guards PASS.
- Manifest hash:
  `5ec520a2ec1c75e10f05b23144bf73caa3e609c1a6ed081d968de5badb6b9a83`.
- Steps 2–9: pending at that commit; no certificate, proxy, arm collection or
  consumption gate existed.

**Step 2 (2026-11-12, commit `b884984`):**

- lint: exit 0, zero warnings.
- typecheck: exit 0.
- `node --test tests/identity-calibration-bounds.test.mjs`: 19/19 pass, 0 fail,
  0 skipped.
- quality: PASS, 693 files under the 400-line ceiling.
- `npm test`: 1,137 pass / 0 fail / 16 environment-gated skips.
- `lib/identity/stats/betting.ts` takes its defaults from the sealed manifest:
  `alphaCell = 0.01 / 6`, `lambda = 0.5`, `delta = 0.05` (still
  `provisional_until_step_3_simulation`), threshold 600.
- Steps 3–9: pending at that commit; no δ simulation, arm registry, proxy,
  certificate, collection or consumption gate existed.

**Step 3 (2026-11-12, commit `1f75c44`):**

- lint: exit 0, zero warnings.
- typecheck: exit 0.
- `node --test tests/identity-calibration-bounds.test.mjs`: 26/26 pass, 0 fail,
  0 skipped.
- quality: PASS, 694 files under the 400-line ceiling; `delta.ts` is 400 lines.
- `npm test`: 1,144 pass / 0 fail / 16 environment-gated skips (1,160 total).
- Simulation: 1,536 streams (6 cells × 256), horizon 20, seed 2,026,112, ±8%
  drift, bound 300 (`alphaCell` × margin 2), raw δ 0.15950630216299225,
  recorded δ 0.20735819281188994, not clamped, bound held.
- Manifest hash re-recorded:
  `bdd152ba2db5bb1bafe702a531f660f014517782011f21ec927d7b00dafdc9ba`.
**Step 4 (2026-11-13, working tree at `52eab59`):**

- lint: exit 0, zero warnings.
- typecheck: exit 0.
- `node --test tests/identity-calibration-proxy.test.mjs`: 13/13 pass, 0 fail,
  0 skipped.
- quality: PASS, 696 files under the 400-line ceiling.
- `npm run verify`: PASS 12/12 gates, 1,173/1,173 tests, PostgreSQL 20/20,
  156.4 s.
- Implemented: `lib/identity/calibration/arms.ts`,
  `lib/identity/calibration/proxy.ts`,
  `scripts/identity-calibration-proxy.mjs` and
  `tests/identity-calibration-proxy.test.mjs`.
- Steps 5–9: pending; no collection CLI, certificate, store table or
  consumption gate exists.

## Perfection Loop

### Loop 1 — RED

- **RED:** the shipped decision rule has no measured error rate
  (`battery.ts:28-29`, `fingerprint.ts:105-114`); no certificate type, table,
  issue path or consumption gate exists (`rg` returns zero matches in
  `lib/identity`); the review's 20-positive gate cannot certify 0.90
  (Wilson 20/20 = 0.8389); the review's 400-verdict gate costs 77,200 requests
  and 128.7 h at 10 RPM; the control multiplier is a fourth invented constant
  (`runner-verdict.ts:137`).
- **GREEN:** the nine steps above: pre-registered manifest, pure bounds/power,
  e-process with δ calibration, API-only arms with a loopback adversary,
  certificate storage, consumption gate, published method, sealed receipt.
- **AUDIT:** every claim checked against the tree, not assumed. `DECISION` is at
  `battery.ts:25-33` and the multipliers at 28-29; the comparison is at
  `fingerprint.ts:105-114`; the control multiplier is at `runner-verdict.ts:137`;
  the schema tables are those in `lib/storage/schema/identity.ts`; the test
  count is seven by glob. The four numbers were computed by `node -e`, not
  recalled.
- **ADVERSARIAL:** a certificate could launder a weak detector. If the arms are
  chosen after seeing the results, or if the design set and the reported set
  overlap, the certificate is a receipt for self-confirmation. Defence: the
  manifest is sealed before collection, the held-out split is disjoint, and the
  acceptance predicate is fixed in the seal. Another failure: a certificate for
  `self_consistent` could be displayed as if it covered `consistent`; the scope
  field and the verdict-time reference-provider check prevent that.
- **CHANGE DELTA:** measured in the note below.

### Missed Questions

1. **Can 20 positives certify a 0.90 TPR lower bound?** No. Wilson 20/20 is
   0.8389; 35/35 is 0.9011. The record adopts 35 with zero misses and records
   the review's number as insufficient.
2. **Is a 400-comparison FPR gate affordable?** Only at fingerprint
   granularity: 35,880 requests, 59.8 h at 10 RPM. At whole-verdict granularity
   it is 77,200 requests and 128.7 h. The lab measures the fingerprint
   detector's own unit and bounds the verdict by Bonferroni construction.
3. **Does API-only calibration cover quantization?** No. It is `not_tested` and
   the certificate says so. §12.4 already forbids the claim.
4. **Are the positive arms real model behaviour?** The three wire-level arms are
   a loopback proxy in front of a real upstream. They reproduce relay
   misbehaviour, not different weights. The substitution and version arms route
   to real, declared upstream ids; a version pair that does not separate is
   `not_separable`, not a pass.
5. **Can the lab tune on the arms it reports?** No. The design set and the
   held-out set are disjoint, and the manifest is sealed before collection.
6. **What if only one provider serves the model?** Then only `self_consistent`
   can be certified; the `consistent` claim stays `unsupported` for that route.
   The certificate's scope is checked at verdict time.
7. **Does the 7-day TTL survive the matrix, and does it govern the
   certificate?** At 10 RPM the matrix is 74.85 h (3.1 days; ≈3.7 days with the
   retry allowance), so one matrix fits inside the reference TTL and a second
   pass does not. The CLI refuses to start a matrix that cannot finish before
   the reference expires. The certificate itself is valid for 90 days, not 7:
   it certifies a detector and protocol pair, while the TTL certifies a
   reference. Conflating them would require a 75-hour recalibration every week.
8. **Does a certificate make the verdict tamper-proof?** No. The content hash
   detects corruption and accidental mismatch, not a compromised database role,
   the same limit already stated for references in FID-087.
9. **Does the e-process replace JSD?** No. JSD stays the reported effect size;
   the e-process is the decision rule. The public panel does not expose either
   number, so no copy migration is needed.

### Loop 2 — Independent audit and self-correction

- **RED:** four weaknesses survived Loop 1. The FPR construction was stated
  without naming the multiplicity unit: "α = 0.01" alone does not bound a
  six-cell verdict. The control run's zero-false-positive rule had no
  disposition for an observed false positive beyond "block", which invites a
  silent re-run on the same data. The activation step could be read as automatic
  after `issue`, which would let a failed certificate become authoritative
  without an operator. And the certificate expiry was copied from the reference
  TTL, which would force a 74.85-hour recalibration every seven days and make
  the lane unusable.
- **GREEN:** the bound is now explicitly `α_cell = 0.01/6` with a union bound
  and wealth ≥ 600; an observed false positive requires root-cause analysis and a
  **fresh** held-out control set, never a threshold change; `issue` writes
  `active = 0` and `activate` is a separate explicit operator action; the
  certificate is valid for 90 days and voids on any sealed-input change, while
  the 7-day TTL constrains only the matrix run.
- **AUDIT:** the multiplicity correction was checked against the six fingerprint
  cells in `FINGERPRINT_CELLS`, and the wealth threshold recomputed as
  `1/0.0016667 = 600`. The control-set rule matches the hold-out discipline in
  step 1; the activation split matches the existing publish/review shape in
  FID-087. The expiry correction was checked against §7 row 10 (quarterly
  calibration review) and against the reference TTL in `battery.ts`; the two
  clocks serve different objects and are now separate.
- **ADVERSARIAL:** the disjoint-arms rule is only as strong as the arm
  provenance record. A design arm with a fresh nonce is still the same prompt.
  Defence: the manifest records the arm ids and the collection window, and the
  certificate reports the arm set hash, so a reviewer can see reuse even when
  the numbers pass.
- **CHANGE DELTA:** measured in the note below.

### Loop 3 — Final convergence

- **RED:** residual risk that a green certificate is read as a guarantee of
  authenticity, and that a future protocol bump silently reuses an old
  certificate.
- **GREEN:** the certificate's public copy is limited to "behavioral consistency
  under protocol {id}, tested {date}"; the consumption gate matches protocol
  hash, detector version and manifest hash, so a protocol bump without a new
  certificate degrades to `inconclusive`.
- **AUDIT:** no further defect found in the contract. Each of the nine steps maps
  to a named test or to the live receipt, and the four arithmetic constants are
  reproduced by command in the Evidence block. The public phrase "calibration
  certificate" was checked against `PROHIBITED_PUBLIC_WORDS`
  (`lib/identity/view.ts:57-61`): it bans `certified`, not `certificate`, so the
  existing copy test stays green without weakening the list.
- **ADVERSARIAL:** a reviewer could implement steps 1–8 and skip step 7's
  refusal path, leaving a publishable `consistent` without a certificate. No
  gate detects that; it is a review obligation stated here and its consumption
  suite is step 7's first deliverable.
- **CHANGE DELTA:** measured in the note below.

> **Measured document delta.** The pre-audit draft was 29,979 bytes; the
> converged record is 32,699 bytes, a whole-document change of +2,720 bytes
> (+9.07%) in the audit pass, under the 10% per-pass cap. The three loop entries
> share one measured delta because the record was authored as a single draft and
> revised in one audit pass; the figure is a whole-document measurement, not a
> per-pass derivation, and it is disclosed on the same basis as the 2026-11-06
> MC1 and 2026-11-10 001 entries in `SCOPE.md`.

### Implementation Evidence (REQUIRED for `closed`)

Steps 1–4 are implemented; steps 5–9 are not started. The status is `fixed`
for the landed slice and cannot become `closed` until the certificate
consumption gate and the remaining test paths land.

- [x] **Commit SHA:** step 1 is `d66a538`; step 2 is `b884984`; step 3 is
  `1f75c44`.
- [x] **File:line ranges:** `lib/identity/calibration/manifest.ts` (frozen
  manifest, hash, seal, protocol verification),
  `lib/identity/calibration/bounds.ts` (Wilson lower, exact zero-event upper,
  rule of three, acceptance predicate), `lib/identity/calibration/power.ts`
  (minimum sample sizes and the request matrix), `lib/identity/protocol.ts`
  (`buildProtocolRecord`, shared by v2 and v3),
  `lib/identity/stats/betting.ts` (Good-Turing `<other>` floor, reference and
  previsible masses, mixture-Kelly factor, log-wealth update, anytime-valid
  stopping, verdict union bound), `lib/identity/calibration/delta.ts`
  (Dirichlet/Jeffreys draw, ±8% drift, gamma sampler, smallest-feasible-drift
  solver, frozen-δ verifier) and `tests/identity-calibration-bounds.test.mjs`
  (26 tests).
- [x] **Gate output:** step 3: `node --test
  tests/identity-calibration-bounds.test.mjs` 26/26; typecheck exit 0; lint exit
  0; quality PASS over 694 files; `npm test` 1,144 pass / 0 fail / 16
  environment-gated skips. Step 2: the same file 19/19, quality 693 files,
  `npm test` 1,137 pass. Step 1: the same file 10/10, quality 692 files,
  `npm test` 1,128 pass; existing `identity-protocol` + `identity-stats` 22/22.
- [x] **Reproducibility:** the manifest hash is
  `bdd152ba2db5bb1bafe702a531f660f014517782011f21ec927d7b00dafdc9ba` (the
  step-1 hash `5ec520a2…9a83` sealed the provisional δ); `CALIBRATION_POWER`
  reports 35 positives (0.9010957 lower), 299 controls (0.0099691 upper), 44,910
  requests, 74.85 h at 10 RPM and 12.475 h at 60 RPM. `calibrateDelta()` returns
  raw 0.15950630216299225 and 0.20735819281188994 for the recorded seed, so the
  frozen δ is reproducible by command. The hash and both numbers are pinned in
  the tests, and `verifyFrozenDelta` refuses a manifest whose δ or simulation
  inputs disagree.
- [x] **Step statuses:** steps 1–4 `implemented` and committed; steps 5–9
  `blocked` on the operator-supplied upstream, credential and two routing model
  ids named in the resolution.
- [x] **Step 4 files:** `lib/identity/calibration/arms.ts` (arm registry, one
  transform per arm, hashed transform spec, coverage assertion),
  `lib/identity/calibration/proxy.ts` (loopback admission, credential
  stripping, URL join) and `scripts/identity-calibration-proxy.mjs` (loopback
  server with one declared transform, no redirect, no cache), guarded by
  `tests/identity-calibration-proxy.test.mjs` (13 tests).

### Code Verification Evidence

- [x] The decision constants and comparison were read from the working tree,
  not from the review's description.
- [x] The absence of calibration code was checked by search across
  `lib/identity`.
- [x] The four sample-size and cost figures were recomputed by command.
- [x] The seven identity test suites were enumerated by glob.
- [x] Register contracts accept the record: `npm run repository:check` PASS and
  `npm run attribution` PASS.
- [x] Step 1 implementation audit: the frozen manifest hash, the sample sizes
  and the protocol seal were reproduced by command before the commit; the four
  published numbers are asserted by the new test.
- [x] FID status reflects the actual implementation state: `fixed` for steps
  1–4; steps 5–9 are unwritten, so this record is not a closure candidate.

## Resolution

- **Status:** `fixed` since the 2026-11-26 house audit; the `converged` value
  above the Summary described the pre-implementation state that ended at
  `d66a538`.
- **Convergence Date:** 2026-11-10 19:32 EST
- **Next action:** steps 1–4 are implemented and committed. Steps 1–3 are at
  `d66a538`, `b884984` and `1f75c44`; step 4 is at `495e8b3` for `arms.ts`,
  `proxy.ts` and its test, and its `scripts/identity-calibration-proxy.mjs`
  wrapper was left untracked there and committed under
  [FID-2026-1122-001](archive/FID-2026-1122-001-commit-calibration-proxy.md). The
  13-test suite, lint, typecheck, quality and the full 12-gate verify passed on
  the step-4 tree at `52eab59`. Step 5 (collection) is next and cannot start without an
  operator-supplied upstream, credential and two declared routing model ids,
  because the matrix is 44,910 requests / 74.85 h at 10 RPM. Steps 6–8
  implement compute/issue, activation/consumption and the published method;
  step 9 closes only with the live receipt and an active certificate. No probe
  has been sent.
- **Archived:** no.

## Lessons Learned

A threshold that looks conservative is not a calibration. The split-half noise
term measured the reference's variability, and the multipliers were sealed as if
sealing were the same as measuring; the seal guarantees the constant cannot
change silently, not that it was ever right. The check that catches this is
arithmetic against the claim: can the stated sample size produce the stated
confidence bound, and can the stated number of comparisons run before the
reference expires. Two of the review's three numbers failed that check, and the
lab is only worth building because the corrected numbers can pass it.
