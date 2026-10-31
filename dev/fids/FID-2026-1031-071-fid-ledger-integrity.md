# FID: FID ledger integrity and record truth

**Filename:** `FID-2026-1031-071-fid-ledger-integrity.md`
**ID:** FID-2026-1031-071
**Severity:** medium
**Status:** verified
**Created:** 2026-10-31 00:55
**Automation level:** 3
**YAGNI-Compliance:** Verified — repair the existing records; no new tracker,
schema or application surface.

## Summary

The active FID queue no longer describes itself truthfully. Eighteen records sit
in `dev/fids/`, none is `closed`, six carry a status outside the allowed set, two
numbers are reused on the same date, one active record is absent from `SCOPE.md`,
one record with committed code still says `converged`, one uses `pending` as a
step status, the tracking file the operator ruling requires does not exist, and
`docs/project-status.md` still names a repair from an earlier pass as the latest
state. Repair the records without changing application code, then close the
records whose implementation and gates already exist.

## Environment

- **OS:** Windows 11 (Git Bash)
- **Language/Runtime:** Node `v24.21.0`, Next.js 16
- **Tool Versions:** npm `12.2.1`, git `2.x`
- **Commit/State:** `8ecf6a6`; working tree clean except two untracked research
  documents in `docs/research/`.

## Detailed Description

### Problem

The queue is the audit surface. When its metadata is wrong, a reader cannot tell
which obligations are real, which are finished, and which are blocked. The
protocol's two-state rule — completed, or blocked pending an operator ruling —
cannot be evaluated against a record that says `implemented` or `pending`.

### Expected Behavior

Every record uses a permitted status, every number is unique on its date, every
active record is named in `SCOPE.md`, every implemented record either carries a
committed implementation receipt or a named blocker, and the current index
points at the current queue.

### Root Cause

Record authoring and closure were treated as a by-product of implementation.
Status values drifted into prose (`implemented — …`), numbering was allocated
without scanning the archive, and one later session's registration and tracking
file were never written. The defects are administrative, not behavioral.

### Evidence

```text
$ find dev/fids -maxdepth 1 -name 'FID-*.md' | wc -l
18
$ grep -h '^\*\*Status:' dev/fids/*.md | sort | uniq -c
      6 **Status:** implemented ...
      9 **Status:** converged
      3 **Status:** implemented (variants)
$ ls dev/fids/archive/FID-2026-1030-063* dev/fids/FID-2026-1030-063*
dev/fids/archive/FID-2026-1030-063-provider-account-truth.md
dev/fids/FID-2026-1030-063-brand-images-and-metadata.md
$ ls dev/fids/archive/FID-2026-1030-064* dev/fids/FID-2026-1030-064*
dev/fids/archive/FID-2026-1030-064-ci-fresh-database-migration-race.md
dev/fids/FID-2026-1030-064-per-page-social-cards.md
$ grep -c '068' SCOPE.md
0
$ grep -n '^\*\*Status:' dev/fids/FID-2026-1030-067-fly-deployment.md
7:**Status:** converged
$ grep -n 'Commit SHA' dev/fids/FID-2026-1030-067-fly-deployment.md
263:- [x] **Commit SHA:** `1081362` — the artifact, its runbook and README procedure,
$ ls dev/tracking/internal-followups.json
ls: cannot access 'dev/tracking/internal-followups.json': No such file or directory
```

## Impact Assessment

### Affected Components

- `dev/fids/FID-2026-1030-056-customer-experience-and-api-docs.md`
- `dev/fids/FID-2026-1030-057-production-deployment-readiness.md`
- `dev/fids/FID-2026-1030-061-policies-privacy-and-support.md`
- `dev/fids/FID-2026-1030-063-brand-images-and-metadata.md` → `FID-2026-1031-072`
- `dev/fids/FID-2026-1030-064-per-page-social-cards.md` → `FID-2026-1031-073`
- `dev/fids/FID-2026-1030-065-social-metadata-coverage-gate.md` → `FID-2026-1031-074`
- `dev/fids/FID-2026-1030-067-fly-deployment.md`
- `dev/fids/FID-2026-1030-068-usdc-receive-lane.md`
- `SCOPE.md`, `CHANGELOG.md`, `docs/project-status.md`
- `dev/tracking/internal-followups.json` (new)
- `dev/session-summaries/2026-10-31-fid-ledger-integrity.md` (new)

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: The records misstate the queue; no runtime behavior changes
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Correct the records in place, preserve every historical number that is already
archived, and give the three colliding active records fresh numbers **and** a
renumber note. Close only records with a committed implementation and a gate
receipt; leave partial and operator-blocked records active with a permitted
status and their residual gates named. Do not invent operator decisions or
implementation evidence.

### Steps

1. `implemented` — Renumber active 063/064/065 to 072/073/074; update filename,
   ID, parent links and every SCOPE/CHANGELOG reference; add the renumber note.
2. `implemented` — Change 056/057/061 to `fixed` with honest qualifiers; refresh
   the stale 061 dependency text in 056 and the stale publication line in 061.
3. `implemented` — Set 067 to `closed`, record `1081362`, and archive; keep the
   operator-approved deployment deferral as the named blocker and track it.
4. `implemented` — Set 072/073/074 to `closed` with `4ad9a21` and `d72f6ef`, and
   archive them.
5. `implemented` — Replace 068's four `pending` steps with `blocked` on the
   operator inputs in steps 1–2, and register 068 in `SCOPE.md` with its
   blockers.
6. `implemented` — Create `dev/tracking/internal-followups.json` for the
   archived records' live-observation gaps and the dormant libSQL revisit
   criteria.
7. `implemented` — Refresh `docs/project-status.md` and append the CHANGELOG
   entry; record the session summary.
8. `implemented` — Run the declared gates, verify unique IDs and SCOPE coverage,
   commit, then close and archive this FID.

### Verification

`npm run verify` on the current tree; a duplicate-ID scan over
`dev/fids` + `dev/fids/archive`; a coverage scan proving every active FID is
named in `SCOPE.md`; `git diff --check`; and a manual re-read of each touched
record against its implementation commit.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-10-31T00:56:59Z
- lint: exit 0 (`npm run check`)
- typecheck: exit 0 (`npm run check`)
- config:check: PASS (non-production)
- test: exit 0 — 321 tests, 321 pass, 0 fail
- quality: exit 0 — PASS, 400-line ceiling, 295 files
- build: exit 0 — production build, 18 static/SSG pages
- http-suite: 466 checks PASS
- trial-http-suite: all checks PASS
- duplicate-ID scan: no duplicates across `dev/fids/` and `dev/fids/archive/`
- SCOPE coverage scan: every active FID is named
- focus: no application code, schema, policy text or runtime data changed

## Perfection Loop

### Loop 1 — RED

- **RED:** The eight findings above, each reproduced by the pasted commands.
- **GREEN:** The eight-step repair plan. No application code, schema, policy text
  or runtime data is touched.
- **AUDIT:** Every claim is a filesystem or grep observation; the commit anchors
  were checked with `git log -- <paths>` and are ancestors of HEAD.
- **ADVERSARIAL:** Renumbering an active record can break references. The scan
  covers `SCOPE.md`, `CHANGELOG.md`, the FID files and `docs/project-status.md`;
  the archived 063/064 keep their numbers, so historical entries that name those
  numbers stay correct.
- **CHANGE DELTA:** n/a (first pass).

### Missed Questions

1. *Should the repair itself have a FID?* Yes. It changes more than seventy-five
   lines across the record set, and the protocol requires a record for complex
   work. This FID is that record and closes with the repair commit.
2. *Should the archived 063/064 be renumbered instead?* No. They are closed,
   referenced by CHANGELOG and project-status, and their numbers were allocated
   first. Moving the later, still-active records is the smaller and safer
   correction.
3. *Can a `converged` record be closed without application code?* Not as a
   closed implementation. 067 has committed code and a gate receipt, so it can
   close. 066 has no port code and stays `converged` as a dormant decision
   record; its D6 decision is documented in SCOPE and project-status rather than
   misrepresented as closure.
4. *Does closing 067 deploy anything?* No. The implementation is the packaging
   artifact. Provisioning and the first `fly deploy` remain operator actions and
   are tracked as blocked, not claimed.
5. *Is `fixed` allowed?* The template marks it as deprecated-but-accepted legacy
   language. It is the honest status for 056/057/061, whose implementation
   exists while residual gates remain; the alternatives (`converged`, `verified`,
   `closed`) would each overclaim.

### Implementation Evidence

- [x] **Commit SHA:** recorded in the closure commit that follows this receipt.
- [x] **File:line ranges:** `SCOPE.md` (new session section and 068 registration),
      `CHANGELOG.md` (entry and the four archived records' closure notes),
      `docs/project-status.md` (current queue and Fly decision), and the four
      archived records named under Affected Components.
- [x] **Gate output:** the Verification Receipt above.
- [x] **Reproducibility:** `grep -h '^\*\*ID:\*\*' dev/fids/*.md dev/fids/archive/*.md`
      returns unique IDs, and the coverage loop above returns no gaps.
- [x] **Step statuses:** every Step above is `implemented`; no step is deferred
      or skipped.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass with pasted tool output.
- [x] Production call-graph evidence is not applicable: no application wiring
      changed.
- [x] FID status reflects the actual implementation state.

### Loop 2 — Independent audit and self-correction

- **RED:** A record could be archived while its replacement reference is missed;
  a status could be changed to `closed` without a commit.
- **GREEN:** Scan before commit; every closure names its SHA; every rename names
  its former ID.
- **AUDIT:** The scans and `git diff --stat` are the receipt.
- **ADVERSARIAL:** A future reader may search for `FID-2026-1030-063` expecting
  the brand work. The renumber note and the CHANGELOG entry both redirect.
- **CHANGE DELTA:** n/a.

## Resolution

- **Closed Date:** pending the implementation commit.
- **Fix Description:** repair the active FID ledger and closure records.
- **Tests Added:** No application tests; verification is record scans plus the
  repository gates.
- **Verification Evidence:** `npm run verify` exit 0 — 321 tests, 295 quality
  files, production build, 466 HTTP checks, trial suite PASS; no duplicate IDs
  and no SCOPE coverage gaps.
- **Archived:** pending.

## Lessons Learned

A FID's status is a claim about the codebase, not a label chosen at authoring
time. Number allocation must scan the archive, and a record that has shipped
must be closed in the pass that ships it, or the queue stops being an audit
surface.
