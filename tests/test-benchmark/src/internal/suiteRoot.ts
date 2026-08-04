import path from "node:path";

const here: string = __dirname;

/**
 * Absolute path of this feature suite's own package root.
 *
 * Anchored on the module rather than on the process working directory, so a
 * case behaves the same whether the suite is driven from the repository root or
 * from its own package. `tests/test-evidence/src/internal/suiteRoot.ts` anchors
 * itself the same way and for the same reason.
 */
export const suiteRoot: string = path.resolve(here, "..", "..");

/**
 * Absolute path of the repository that owns the benchmark template.
 *
 * `EvidenceBenchmarkWorkspace.prepareWorkspace` resolves `benchmark/template`
 * and `benchmark/requirements` under whatever repository it is handed, so every
 * case hands it this one — the working tree under test, never a fixture that
 * imitates it.
 */
export const repositoryRoot: string = path.resolve(suiteRoot, "..", "..");
