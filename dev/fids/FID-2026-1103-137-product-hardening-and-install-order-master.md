# FID: Product hardening and install-order master

**Filename:** `FID-2026-1103-137-product-hardening-and-install-order-master.md`
**ID:** FID-2026-1103-137
**Severity:** critical
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

This master sequences the eleven findings from the project review into an
installable progression. It is a coordination contract, not implementation or
release approval. Each child FID must converge before code begins, and each
implemented child must pass its declared gates before dependent work starts.

## Ordered Work Register

| Order | FID | Work | Dependency and exit condition |
| ---: | --- | --- | --- |
| 1 | 126 | Production concurrency proof | FID-125 migration baseline; mandatory PostgreSQL evidence |
| 2 | 131 | Stream cancellation telemetry | gateway settlement behavior preserved |
| 3 | 130 | Durable feed validators | measurement proves durable state is justified |
| 4 | 132 | Search indexing | measured query/write baseline exists |
| 5 | 128 | Admin session continuity | safe redirect tests pass |
| 6 | 133 | Admin environment diagnostics | no secret reaches HTML/logs |
| 7 | 129 | Content freshness and source guidance | public/private projections remain separated |
| 8 | 134 | Consistent actionable empty states | state taxonomy adopted by four surfaces |
| 9 | 135 | Current project status index | all links and current claims verified |
| 10 | 136 | Machine-readable verification summary | summary cannot mask skipped gates |
| 11 | 127 | Real launch acceptance receipt | all technical gates plus operator acceptance |

## Dependency Rules

1. Implement and verify FID-126 before relying on financial concurrency claims.
2. Implement FID-131 before FID-127 so live streaming evidence is observable.
3. Implement FIDs 130 and 132 only after recording their measurement baselines.
4. FIDs 128–129 and 133–136 may proceed in order after their listed inputs;
   each must preserve the existing launch FIDs 043, 062, and 068.
5. FID-127 is the final acceptance contract. It cannot be closed by fixture
   output, and it cannot authorize release without an operator ruling.

## Verification Gates

- Each child FID's declared gates, in order.
- `npm run attribution`
- `npm run verify`
- `npm run test:http`
- `npm run test:recovery`
- `npm run test:load`
- operator acceptance receipt for FID-127

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** eleven findings lacked durable contracts and a dependency-aware
  installation order; external acceptance was mixed with code readiness.
- **GREEN:** FIDs 126–136 define separate contracts and the table above gives a
  conservative sequence with explicit evidence boundaries.
- **AUDIT:** every reviewed finding has exactly one child FID; every child is
  named in this register; no child claims implementation or closure.
- **ADVERSARIAL:** skipped gates, hidden external blockers, circular dependency,
  premature launch approval, and a child implemented outside this order must be
  visible in SCOPE and the receipt.
- **CHANGE DELTA:** 9%; converged.

### Missed Questions

1. **Can the children be implemented in parallel?** Only where their dependency
   rows and shared migration/verification constraints permit it; the default is
   the ordered sequence above.
2. **Does this master replace the launch master?** No; FID-043 remains the
   launch dependency register and FID-127 supplies the new acceptance receipt.
3. **Does convergence authorize code?** It authorizes the implementation plan;
   code must follow the FID-Bound Execution rule and pass gates.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started; this is the sequencing and coordination FID.
- **Archived:** no.
