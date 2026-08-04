# Intervention

Diagnose before acting. Never blind-retry, never edit retained state, and never substitute a session.

Every remedy lands outside the measured workspace or in this repository.

## Triage

| What you observed | Remedy |
| --- | --- |
| A cell edited `tsconfig.json`, `lint.config.ts`, or a package entry | [Warn it](warning.md), then resume the same run. [boundary.md](boundary.md) owns the criteria |
| A cell stopped, a process died, or a launch or resume failed | [Diagnose](recovery.md), then resume the same run |
| A cell's ports have a listener but no live runner of its own | [Free the ports](recovery.md), then resume |
| A Plain cell sits at `awaiting-review-verdict` | Resume to retry the inspection. [plain-review.md](../plain-review.md) owns the loop |
| The dashboard disagrees with `state.json` | Regenerate it. [reporting.md](../reporting.md) owns the commands |
| A template, instruction, or runner defect | Fix it where [boundary.md](boundary.md) permits |
| Anything else | Record it in the pull-request prose and change nothing |

## Topics

- **[Boundary](boundary.md)** — what never changes, the three files nobody touches, their hit criteria, and where a benchmark defect may be corrected.
- **[Warning](warning.md)** — the operator's one channel into a running cell.
- **[Recovery](recovery.md)** — diagnosis, cell ports, resume, checkpoint-derived runs, and cancellation.
