# ECHO Protocol v0.2.0 — Project Application

This repository adopts ECHO Protocol v0.2.0. The canonical reference is the
Savant-Code `ECHO.md`; this file is the project's working application of it.
Where this summary is silent, the canonical laws apply.

## Purpose

ECHO binds work to evidence: a change is planned in a FID, the FID converges
before code, every claim is verified with real command output, and closure
requires a commit. The point is not ceremony — it is that a green build alone
proves almost nothing.

## The 15 Laws

### Immutable process laws

1. **Read 0-EOF before touch.** Read every file completely before editing it.
2. **Present before act.** Present the change and its impact before
   implementation. Dropping approved scope needs the same approval as adding it.
3. **Verify before proceed.** Run the declared build, typecheck, lint, test, and
   quality gates before moving on. No broken builds.
4. **Verify call-graph reachability.** Grep production entry points to confirm
   the code is actually called. Compilation is not wiring.

### Extended code laws

5. **No pseudo-code, TODOs, or placeholders.**
6. **No type-safety shortcuts.** No `any` to bypass a real type problem.
7. **Search before creating.** Reuse or generalize existing code.
8. **Log intent before coding.** Record the intended change in the FID or
   session summary.
9. **Production-grade documentation.** Labels and docs match behavior.
10. **Update tracking after every feature.** FID, CHANGELOG, session summary.
11. **Follow discovered patterns exactly.**
12. **Never expose sensitive data** in logs, errors, responses, or the client.
13. **Utility-first, universal logic.** One function, one truth.
14. **Handle every error path.** Propagate or handle explicitly; no empty catch.
15. **The build stays clean.** Zero errors, zero warnings.

## The Five Questions

1. Will this work for all cases, not only the common one?
2. Will it scale to the expected load, not only the demo?
3. Will it survive a hostile user, not only an honest one?
4. Will it be maintainable in two years?
5. Does it set the standard rather than merely meet it?

## Perfection Loop

The loop runs on the **FID document**, not on the code:

```text
RED → GREEN → AUDIT → ADVERSARIAL → SELF-CORRECT → COMPLETE
```

- **RED** — catalog defects with exact evidence.
- **GREEN** — minimal corrective plan; answer the Five Questions.
- **AUDIT** — independent method; `file:line` citations; caller greps.
- **ADVERSARIAL** — strongest counterexample; challenge every unevidenced PASS.
- **SELF-CORRECT** — revise the FID, then re-audit.
- **COMPLETE** — close, archive, CHANGELOG, commit.

Limits: at most 10 passes; a corrective pass changes at most 10% of the previous
document; convergence requires two stable passes below 2% with no actionable
findings.

## FID Lifecycle

```text
dev/fids/FID-YYYY-MMDD-NNN-title.md
  → converged plan
  → implementation
  → verification receipt with real output
  → commit SHA
  → dev/fids/archive/
  → CHANGELOG entry
```

A FID status is `created | analyzed | converged | verified | closed`.
`implemented` is a step status, never a FID status. A FID that cannot name a
commit cannot close. Verification performed before the current bytes is
historical evidence, not current proof.

## Automation Levels

- **1 — Guided:** approval required for every action.
- **2 — Supervised:** approved work plus reversible in-scope fixes; stop before
  anything irreversible.
- **3 — Autonomous:** complete in-project work in one pass (default).

This repository's ceiling is level 3 (`protocol.config.yaml`). No level lifts
the credential rules, the no-attribution rule, the project-directory boundary,
or the requirement to verify.

## Honest Assessment

State what was tested, what was not, and what the evidence proves. Mark
inaccessible evidence `NEEDS-REVIEW` rather than converting it to PASS. Do not
describe a feature as working because it compiles, renders, or returns HTTP 200;
describe the exact check that was run.
