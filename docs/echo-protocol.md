<!-- markdownlint-disable MD013 -->
# ECHO Protocol

ECHO governs engineering work in this repository. The **governing** contract is
the single-agent adaptation at
[`dev/echo-v0.1.2-single-agent.md`](../dev/echo-v0.1.2-single-agent.md), reached
through the boot marker [`ECHO-single-agent.md`](../ECHO-single-agent.md). The
canonical harness contract [`ECHO.md`](../ECHO.md) is reference material and
does not govern a single-agent session. This page is a short orientation, not a
replacement for either protocol.

## The 15 Laws

Laws 1–4 are always active. Laws 5–15 are active when `strict_mode: true`, the
repository default.

| Law | Name | Requirement |
|---|---|---|
| 1 | Read 0-EOF Before Touch | Read every file completely before editing it. Project files are edited directly, not through scripted transforms. |
| 2 | Present Before Act | Record the proposed work and its impact before implementation. Approval requirements follow the session's automation level; approved scope is not silently reduced. |
| 3 | Verify Before Proceed | Run the applicable build and test commands and use their actual output as evidence. |
| 4 | Verify Call-Graph Reachability | After wiring a feature, confirm production entry points call it. Compilation alone is insufficient. |
| 5 | No pseudo-code, TODOs, or placeholders | Deliver production-ready work rather than leaving stubs. |
| 6 | No type-safety shortcuts | Use domain types and validate untrusted values at boundaries. |
| 7 | Search before creating | Find existing code before adding a new function or abstraction. |
| 8 | Log intent before coding | Record the intended change in the session summary before implementation. |
| 9 | Generate production-grade documentation | Document public behavior and APIs clearly. |
| 10 | Update tracking after every feature | Keep the relevant scope and FID records current. |
| 11 | Follow discovered patterns exactly | Match established project conventions. |
| 12 | Never expose sensitive data | Keep credentials and other sensitive values out of logs and errors. |
| 13 | Utility-first, universal logic | Extend shared logic when it can safely cover the new case; avoid duplicate truths. |
| 14 | Handle all error paths | Propagate failures or handle them explicitly. |
| 15 | Build stays clean | Leave applicable builds and quality gates with zero errors and warnings. |

## How work flows

The Perfection Loop tracks the FID document through RED (findings and evidence),
GREEN (a proposed fix), AUDIT (independent verification), ADVERSARIAL review,
SELF-CORRECT when findings need changes, and COMPLETE. Complex work is
implemented only after its FID converges. The implementation then receives its
own verification.

Task routing differs from the harness: simple, reversible changes under ten
lines may be written directly and verified; anything larger, any new API, or a
second verification failure goes through the FID-bound cycle. The exact
thresholds and approval rules live in the single-agent contract.

## Scope and evidence

Approved and discovered work is completed or remains blocked on a specific
operator decision. Agents do not silently label work out of scope, deferred, or
skipped. Verification claims require command output; design decisions require
their reasoning; status claims require independent evidence.

## Learn more

- [Agent contract](../AGENTS.md)
- [Governing single-agent protocol](../dev/echo-v0.1.2-single-agent.md)
- [Boot marker](../ECHO-single-agent.md)
- [Canonical harness reference](../ECHO.md)
- [Project commands and quality limits](../protocol.config.yaml)
- [Scope register](../SCOPE.md)
- [FID template](../templates/FID-TEMPLATE.md)
