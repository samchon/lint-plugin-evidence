# Cell Integrity

A cell edits its own workspace. That is the measurement, not a violation of it.

Only the edits the cell's **own** instructions forbid void the measurement. The rules that bind the operator in [intervention/boundary.md](../intervention/boundary.md) do not bind a cell, and reading one as the other punishes a cell for doing exactly what it was told to do.

## What Governs A Cell

The workspace carries its own contract, copied in at preparation. Read it there before reporting anything:

| Source in the workspace | What it freezes |
| --- | --- |
| `AGENTS.md` | Agent instructions, policy overrides, package names and scripts, **existing** dependency specifiers, package-manager and engine resolution, workspace routing, shared lint or compiler configuration, and the fixed gate runners |
| `.agents/skills/backend/SKILL.md` | The backend package's `tsconfig.json` and lint configuration, in the package and in `test/` alike — no adding, deleting, or editing, and no toggling claim configuration by phase |
| `.agents/skills/evidence/SKILL.md` | All four claim configuration files and every claim object, except the prescribed `disabled` deletion, with `evidence/graph` held at `error` |
| `.agents/skills/review/SKILL.md` | The same, restated as a review checklist against the baseline commit |

## Legitimate, Never A Hit

**Deleting a predeclared `disabled` property, together with the comment that marks it.** This is the Evidence arm's prescribed unlock, staged layer by layer by the arm's own instructions — `instructions/evidence/backend/start.md` names each claim and the moment to delete it. A cell that never deletes one has failed to advance; a cell that deletes one on schedule is doing its job.

```diff
           symbol: ["model"],
         },
       ],
-      // Remove after every controller contract is complete and build:sdk passes.
-      disabled: true,
```

**Adding a new dependency.** The workspace freezes *existing* dependency specifiers, package names, and scripts. It does not forbid installing something the implementation needs, so a new entry under `dependencies` or `devDependencies` is ordinary work.

```diff
   "dependencies": {
     "@nestia/fetcher": "catalog:samchon",
+    "date-fns": "^4.1.0",
     "typia": "catalog:samchon"
   },
```

Neither belongs in a report. A subagent that flags either is producing a false positive that costs a cell a warning it did not earn.

**The first is Evidence-only.** The base template carries no claim and no `disabled` property; both arrive with the Evidence overlay, in `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, `packages/backend/test/lint.config.ts`, and `packages/frontend/lint.config.ts`. A Plain cell therefore has no legitimate `lint.config.ts` edit at all, and any difference from its baseline is a hit.

## A Hit

The reporting subagent re-reads these in every cell on every cycle, diffing against the run's baseline commit.

### `tsconfig.json`

Any change at all, in either arm, at any nesting level. `include`, `exclude`, `rootDir`, `paths`, and `extends` decide which files enter a Program, and a claim populates only from the Program that owns it. A file dropped from `include` removes the hosts or targets a claim depended on, and the claim then passes while checking nothing.

### `lint.config.ts`

Diff against the baseline, discard the prescribed `disabled` deletions and their marking comments, and report whatever remains. Every other difference is a hit even when the claim still exists and the build still passes:

- A reintroduced `disabled`.
- A changed claim, selector, or reference glob.
- A lowered severity, including anything below `error` on `evidence/graph`.
- A deleted claim.

```diff
-      files: ["src/controllers/**/*.ts"],
+      files: ["src/controllers/health.controller.ts"],
```

### `package.json`

Three properties are frozen and one is not.

**The top-level `main` and `exports` must stay on source, and no top-level `types` may appear.** `publishConfig` points at build output in the baseline and is never a hit.

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

**A changed `name` or `scripts`, or a changed existing dependency specifier**, is also a hit. A new dependency is not.

## Why These Decide The Measurement

Together these files decide what each Program contains and where a package resolves to, and so they decide what every evidence population selects from. That is why a change no one asked for voids the measurement instead of failing it: an empty population demands nothing, and a claim that reaches that state reports full coverage while checking nothing.

## On A Confirmed Hit

Warn the cell and resume it. Never restart it, and never repair the workspace yourself. [intervention/warning.md](../intervention/warning.md) owns the channel and its contents.

Quote the diff you read in the report. A hit asserted without the diff is the kind of unproven claim this product exists to reject.
