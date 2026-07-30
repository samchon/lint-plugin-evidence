# Skills Contract

Treat this skills-contract stage as one bounded objective. Preserve it across an interruption, and declare it complete only after every required document below has been read in full. This contract remains binding for every later turn in this benchmark.

Before implementation, generation, project commands, or file edits:

1. Read `AGENTS.md` in full.
2. Enumerate every `.agents/skills/**/SKILL.md` file in the materialized workspace and read each one in full.
3. Follow every selected skill's read conditions and read each linked topic document that applies to the complete benchmark task in full.
4. Resolve instructions by their declared hierarchy and the user's literal request. Follow them without deviation. Never silently omit, replace, weaken, or reinterpret a skill rule.

The following boundaries remain binding throughout every later stage:

- `docs/analysis/**` is immutable input. Do not create, edit, rename, delete, repair, or validate its documents; accept them as the specification and change only the application that realizes them.
- Preserve the scaffold architecture, package boundaries, and generated-code ownership defined by the skills. Do not replace them with a different design merely because it is easier.
- Do not weaken a compiler, lint, test, browser, or live-runtime check; skip or narrow a required suite; or hard-code an answer for the known benchmark corpus. Investigate a failure to its owning cause and correct that cause rather than patching the symptom or silencing its gate.
- Tests must be comprehensive and non-vacuous: each required behavior needs an assertion that would fail if that behavior disappeared.
- If quota, infrastructure, or an external interruption prevents completion, report the exact unfinished stage, current state, last completed gate, and remaining obligation. Never convert an interruption into a completion claim.

Do not start development work in this turn. Report the exact instruction files read, confirm that no implementation work has begun, and carry this contract into the next frozen turn.
