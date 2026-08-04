# Boundary

Everything but the arm is frozen while a cohort is measured. An unauthorized change does not fail the measurement — it voids it silently.

## What Never Changes

- **A measured workspace.** What a cell did to its own workspace is the measurement.
- **Requirements.** `benchmark/requirements/**` is opaque, authoritative bytes: never edit, rename, add, delete, normalize, summarize, validate, or challenge them.
- **The three configuration files.** `tsconfig.json`, `lint.config.ts`, and a `package.json` entry point, detailed below.
- **The cell's own reasoning.** Do not prompt the measured agent, inject advice, weaken a gate, hard-code a subject answer, or expose Evidence material to Plain. A cell's questions and partial reports do not invite operator input; its continuation instruction already tells it to finish on its own.

## Three Files Nobody Touches

Under `benchmark/template/**`, in either arm, at any nesting level:

- `tsconfig.json`
- `lint.config.ts`
- a `package.json` top-level `main`, `types`, or `exports` value

Creating or deleting one counts as touching it, and so does adding, removing, or reordering `include`, `exclude`, `ignores`, `paths`, `rootDir`, `extends`, `plugins`, `rules`, or a claim.

**Why these three.** They decide what each Program contains and where a package resolves to, so together they decide what every evidence population selects from. An empty population demands nothing, and a claim that reaches that state reports full coverage while checking nothing.

**The operator is not exempt.** This is the same boundary a measured cell is warned for crossing, and the user owns these files. Do not repair one you believe is broken, do not adapt one to a symptom you are chasing, and do not add an exclusion to silence a diagnostic. Report the file and line you observed, then wait for an explicit instruction naming the file.

## Hit Criteria

The reporting subagent applies these to every cell on every cycle. A confirmed hit is [warned](warning.md) and resumed, never restarted.

### `lint.config.ts`

Diff against the run's baseline commit, discard lines containing `disabled:` and pure comments, and report whatever remains.

Removing a `disabled` property is the Evidence arm's prescribed unlock as each layer completes, and is not a hit:

```diff
       files: ["src/controllers/**/*.ts"],
       reference: [ ... ],
-      disabled: true,
```

Every other edit is tampering. Narrowing a reference glob is the common one, and it is a hit even though the claim still exists and the build still passes:

```diff
-      files: ["src/controllers/**/*.ts"],
+      files: ["src/controllers/health.controller.ts"],
```

### `tsconfig.json`

Report any change at all. `include`, `exclude`, `rootDir`, `paths`, and `extends` decide which files enter a Program, and a claim populates only from the Program that owns it.

### Any `package.json`

Only the top-level `main`, `types`, and `exports` are frozen on source. `publishConfig` points at build output in the baseline and is never a hit.

Baseline, `packages/api/package.json`:

```json
{
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "publishConfig": {
    "main": "./lib/index.js",
    "types": "./lib/index.d.ts"
  }
}
```

A hit, because the top level now resolves to build output:

```json
{
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": { ".": "./lib/index.js" }
}
```

Redirecting the SDK package to `lib` breaks the frozen glob that selects the accessor surface, and gives the cell a reason to edit the claim that depends on it. Report it in any package, `packages/api` included but never alone.

## Where A Defect May Be Corrected

You diagnosed a real defect in the runner, a template, or an instruction. You may fix it, and where the fix lands decides when.

| What you fix | Who reads it | When you may edit it |
| --- | --- | --- |
| `benchmark/src/**` | A benchmark process, at start | Any time. Commit first: a resume requires a clean revision descending from the cell's frozen `benchmarkRevision`, and the runner retains the correction as that process's `runnerRevision`. |
| `benchmark/instructions/**` | A running cell, at its next objective | Not while a cell that will reach it is alive. Stop and preserve the cohort first. |
| `benchmark/template/**`, except the three files | Workspace preparation only | Any time. It reaches future launches only, never a prepared workspace. |
| The three configuration files | Every evidence population in every cell | Never. Report the file and line, and wait for an instruction naming it. |
| `benchmark/requirements/**` | Workspace preparation, byte-for-byte | Never. |

Report the defect immediately, and commit and push the verified correction in the campaign pull request.

A defect confined to an instruction after `backend-start` is corrected by [deriving a new run](recovery.md) from that checkpoint, never by restarting the cell.
