# Phase 2 fixer handoff

Work in the original generated project at `{{WORKSPACE_ROOT}}`. Read its `AGENTS.md` and every applicable linked instruction before editing. The arm-neutral adversarial verification stage confirmed the findings in `{{VERIFIED_MANIFEST}}`; treat only findings whose verdict is `verified` as authorized repair work.

Fix every verified finding at its cause across the full consequence surface, including dependent database, API, backend, frontend, and test behavior. Preserve the project's prescribed traceability method and generated-code ownership boundaries. Add or strengthen non-vacuous regression tests for each repaired behavior.

Run every affected canonical gate and then the full project gate. Do not weaken requirements, tests, lint configuration, or the benchmark harness. Do not inspect the other arm or modify the frozen requirements, prompts, protocol, candidate manifest, or verified manifest.

Return the fixed finding IDs, changed artifact paths, exact commands and exit states, and any unresolved item. Claim completion only when all verified findings are fixed and the canonical gates are green; otherwise report the exact interruption or remaining failure.
