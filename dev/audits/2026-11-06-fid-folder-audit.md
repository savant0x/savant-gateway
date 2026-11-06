# FID folder audit — 2026-11-06

**Scope:** `dev/fids/`, `dev/fids/archive/` and the register in
`dev/fids/README.md` after FID-2026-1106-002 closed at commit `64a30f0`.
**Method:** a read-only scan checked every record's filename, `**ID:**`,
`**Status:**`, `**Created:**`, `**Severity:**`, archive headings, duplicate IDs,
register table membership, register links and declared counts. No historical
record was rewritten; FID-002 is the only record moved or closed in this pass.

## Final state

| Measure | Value |
| --- | ---: |
| Active FIDs | 12 |
| Active slots | 20 |
| Archived FIDs | 177 |
| Allocated IDs | 189 |
| Register table rows | 12 |
| Duplicate IDs | 0 |
| Filename / ID mismatches | 0 |
| Active records with a closure status | 0 |
| Archived records with a non-closure status | 0 |
| Broken active or archive links in the register | 0 |

Active statuses are 8 `converged` and 4 `fixed`. Archived statuses are 165
`closed`, 6 `verified`, 5 annotated closure statuses and 1 `superseded`.

FID-2026-1106-002 is the newest archived record. Its Resolution names commit
`64a30f0`, build `0zm_Bb4Z79zlK7_rqLpy1`, the 14/14 browser matrix and the 12/12
gate run. The register no longer lists it as active.

## Legacy format deviations

The strict scanner reports findings that predate the current template. They are
recorded here, not repaired by rewriting history:

- **4 records have no `## Resolution` heading:** `1030-064`, `1031-077`,
  `1031-078`, `1031-079`. Each carries its closure and commit in metadata
  (`**Archived:**` for 064; `**Closed:**` and `**Commit:**` for 077–079), so the
  missing heading is a format deviation, not a missing closure claim.
- **7 records have no `**Archived:**` field:** `1030-059`, the same three
  1031 records, `1104-001`, `1104-002` and `1105-001`. All have a `## Resolution`
  and a Closed Date or dated closure statement.
- **5 records use an annotated status** instead of the single word `closed` or
  `verified`: `1030-056`, `1030-057`, `1030-061`, `1101-087` and `1104-012`. The
  annotations name real residual acceptance gaps and are preserved.
- **94 archived Resolution sections do not repeat a commit hash inside the
  section.** Many records cite the commit in Environment, Implementation
  Evidence or the Archived line instead. `repository-contract-check` resolves
  every commit it finds and passes; these are old layouts, not new claims.
- **56 archived records do not use the literal `**Verification Evidence:**`
  field.** They use `### Verification Receipt`, a gate list or a dated evidence
  section. No record was found whose only evidence is absent.

The `VAL`-style scanner treats format drift as failure by design. These findings
are documentation-shape debt, not evidence that the work was unverified. The
repository contract check remains the enforcing gate and passes.

## Management actions

1. FID-2026-1106-002 was closed with its commit, build, browser and gate receipt,
   then moved to `archive/`.
2. The register header, active table and closure sections were aligned to the
   folder: 12 active, 177 archived, 189 allocated.
3. The two 2026-11-06 audits are linked from `docs/README.md`.
4. No historical status, resolution, date or evidence claim was rewritten. The
   only earlier correction in this session was the `443cde5` build/commit label
   in `1029-034`, recorded in the receipt audit.

## Limits

- This audit validates structure and cross-references, not whether every
  historical claim is true. Re-running every archived suite against removed code
  is not possible.
- The scanner recognises the documented metadata fields. A record that records a
  fact in free prose is outside its check.
- The 94 commit-in-Resolution and 56 evidence-field findings should be normalised
  only when a record is otherwise touched; mass-rewriting archived receipts
  would destroy the historical trail.
