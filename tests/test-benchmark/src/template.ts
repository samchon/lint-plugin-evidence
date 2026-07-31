import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkRunner } from "../../../benchmark/src/EvidenceBenchmarkRunner.ts";
import { sanitizeBenchmarkEnvironment } from "../../../benchmark/src/sanitizeBenchmarkEnvironment.ts";

/**
 * Verifies neutral template gates and the complete Plain input byte boundary.
 *
 * Plain receives base, Plain overlay, Plain instructions, and opaque
 * requirements. None may expose Evidence treatment markers, because the runner
 * cannot remove a byte after workspace materialization.
 *
 * 1. Inspect every file that can be copied or prompted into a Plain cell.
 * 2. Reject Evidence-only tags, package names, graph terms, paths, and config.
 * 3. Verify the real instruction inventory, skill links, and overlay boundaries.
 * 4. Verify the disposable database and source-first API package contracts.
 */
const main = (): void => {
  const repositoryRoot: string = path.resolve(import.meta.dirname, "../../..");
  const benchmarkRoot: string = path.join(repositoryRoot, "benchmark");
  const templateRoot: string = path.join(benchmarkRoot, "template");
  const plainInputs: string[] = [
    path.join(benchmarkRoot, "instructions", "plain"),
    path.join(benchmarkRoot, "requirements"),
    path.join(templateRoot, "base"),
    path.join(templateRoot, "plain"),
  ];
  const forbiddenPlainInput =
    /@todo\b|@evidence(?:Exclude)?\b|@samchon\/lint-plugin-evidence|evidence[- ]graph|\.agents\/skills\/evidence|instructions\/evidence|lint-plugin-evidence/iu;
  for (const root of plainInputs)
    visitFiles(root, (file) => {
      const relative: string = path
        .relative(repositoryRoot, file)
        .replaceAll(path.sep, "/");
      const source: string = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(
        `${relative}\n${source}`,
        forbiddenPlainInput,
        `Plain input contains Evidence treatment bytes: ${relative}`,
      );
    });
  for (const arm of ["plain", "evidence"] as const) {
    const instructionRoot: string = path.join(
      benchmarkRoot,
      "instructions",
      arm,
    );
    const expected: string[] = [
      ...EvidenceBenchmarkRunner.instructionEntries(arm).map(([, relative]) =>
        relative.slice(arm.length + 1),
      ),
      "continue.md",
    ].sort();
    const actual: string[] = collectFiles(instructionRoot)
      .map((file) =>
        path.relative(instructionRoot, file).replaceAll(path.sep, "/"),
      )
      .sort();
    assert.deepEqual(
      actual,
      expected,
      `${arm} instructions must contain exactly the runner-owned objective set.`,
    );
    for (const relative of actual)
      assert.notEqual(
        fs.readFileSync(path.join(instructionRoot, relative), "utf8").trim(),
        "",
        `${arm}/${relative} must not be empty.`,
      );

    validateMaterializedSkillLinks(templateRoot, arm);
  }
  assert.notEqual(
    fs.readFileSync(
      path.join(benchmarkRoot, "instructions", "plain", "continue.md"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(benchmarkRoot, "instructions", "evidence", "continue.md"),
      "utf8",
    ),
    "Plain and Evidence continuation bytes must remain independent.",
  );

  const baseTemplate: string = path.join(templateRoot, "base");
  const backendRoot: string = path.join(baseTemplate, "packages", "backend");
  assert.deepEqual(
    collectFiles(backendRoot)
      .map((file) => path.relative(backendRoot, file).replaceAll(path.sep, "/"))
      .filter((relative) => path.posix.basename(relative) === "tsconfig.json"),
    ["tsconfig.json"],
    "The backend owns one TypeScript Program.",
  );
  assert.deepEqual(
    collectFiles(backendRoot)
      .map((file) => path.relative(backendRoot, file).replaceAll(path.sep, "/"))
      .filter((relative) => path.posix.basename(relative) === "lint.config.ts")
      .sort(),
    ["lint.config.ts", "test/lint.config.ts"],
    "Backend lint ownership is the package config plus the test-directory extension.",
  );
  const backendPackage = JSON.parse(
    fs.readFileSync(
      path.join(baseTemplate, "packages", "backend", "package.json"),
      "utf8",
    ),
  ) as { scripts: Record<string, string> };
  const workspacePackage = JSON.parse(
    fs.readFileSync(path.join(baseTemplate, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  const compilerConfig = JSON.parse(
    fs.readFileSync(path.join(baseTemplate, "config", "tsconfig.json"), "utf8"),
  ) as { compilerOptions: Record<string, unknown> };
  const backendCompilerConfig = JSON.parse(
    fs.readFileSync(path.join(backendRoot, "tsconfig.json"), "utf8"),
  ) as {
    compilerOptions: Record<string, unknown>;
    include: string[];
  };
  const apiPackage = JSON.parse(
    fs.readFileSync(
      path.join(baseTemplate, "packages", "api", "package.json"),
      "utf8",
    ),
  ) as {
    main: string;
    exports: Record<string, string>;
    publishConfig: {
      main: string;
      types: string;
      exports: Record<string, { types: string; default: string }>;
    };
    scripts: Record<string, string>;
  };
  const evidenceBackendConfig: string = fs.readFileSync(
    path.join(
      templateRoot,
      "evidence",
      "packages",
      "backend",
      "lint.config.ts",
    ),
    "utf8",
  );

  assert.equal(backendPackage.scripts.prepare, undefined);
  assert.equal(backendPackage.scripts["prepare:database"], undefined);
  assert.equal(workspacePackage.scripts["prepare:database"], undefined);
  assert.equal(backendPackage.scripts["build:api"], undefined);
  assert.equal(backendPackage.scripts.schema, "ttsx src/executable/schema.ts");
  assert.equal(
    backendPackage.scripts["check:watch"],
    "ttsc --watch --noEmit --preserveWatchOutput",
  );
  assert.equal(
    backendPackage.scripts["build:sdk"],
    "nestia all && pnpm --dir ../api build",
  );
  assert.equal(
    workspacePackage.scripts["schema:database"],
    "pnpm --filter {{backendPackageName}} --fail-if-no-match schema",
  );
  assert.equal(apiPackage.scripts.build, "rimraf lib && ttsc");
  assert.equal(apiPackage.main, "./src/index.ts");
  assert.deepEqual(apiPackage.exports, { ".": "./src/index.ts" });
  assert.deepEqual(apiPackage.publishConfig, {
    main: "./lib/index.js",
    types: "./lib/index.d.ts",
    exports: {
      ".": {
        types: "./lib/index.d.ts",
        default: "./lib/index.js",
      },
    },
  });
  assert.equal(compilerConfig.compilerOptions.noErrorTruncation, true);
  assert.deepEqual(backendCompilerConfig.include, [
    "src/**/*.ts",
    "test/**/*.ts",
    "../api/src/structures/**/*.ts",
  ]);
  assert.equal("plugins" in backendCompilerConfig.compilerOptions, false);
  assert.match(
    evidenceBackendConfig,
    /"src\/controllers\/\*\*\/\*\.ts",\s*"!src\/controllers\/HealthController\.ts"/u,
  );
  assert.doesNotMatch(
    evidenceBackendConfig,
    /lint\.config\.(?:main|test)\.ts/u,
  );
  assert.match(
    fs.readFileSync(
      path.join(
        templateRoot,
        "evidence",
        ".agents",
        "skills",
        "evidence",
        "SKILL.md",
      ),
      "utf8",
    ),
    /This rule applies equally to TypeScript, Prisma, and Markdown claims\./u,
  );

  assert.deepEqual(
    sanitizeBenchmarkEnvironment({
      Evidence_Benchmark_Archive: "artifact.tgz",
      KEEP_ME: "yes",
      Node_Options: '--trace-warnings --require "runtimeHookPreload.js"',
      TtsX_Runtime_Manifest: "runtime-manifest.json",
      TtSc_Tsgo_Binary: "tsgo",
    }),
    { KEEP_ME: "yes" },
  );
};

const collectFiles = (root: string): string[] => {
  const files: string[] = [];
  visitFiles(root, (file) => files.push(file));
  return files;
};

const visitFiles = (root: string, closure: (file: string) => void): void => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) visitFiles(location, closure);
    else if (entry.isFile()) closure(location);
  }
};

const validateMaterializedSkillLinks = (
  templateRoot: string,
  arm: "plain" | "evidence",
): void => {
  const base: string = path.join(templateRoot, "base");
  const overlay: string = path.join(templateRoot, arm);
  const materialized: Map<string, string> = new Map();
  for (const root of [base, overlay])
    visitFiles(root, (file) => {
      const relative: string = path
        .relative(root, file)
        .replaceAll(path.sep, "/");
      materialized.set(relative, file);
    });

  for (const [relative, file] of materialized) {
    if (!relative.endsWith(".md")) continue;
    const source: string = fs.readFileSync(file, "utf8");
    if (relative.endsWith("/SKILL.md")) {
      const frontmatter: RegExpMatchArray | null = source.match(
        /^---\r?\nname: ([^\r\n]+)\r?\ndescription: ([^\r\n]+)\r?\n---/u,
      );
      assert.ok(frontmatter, `${arm}/${relative} has invalid frontmatter.`);
      assert.equal(
        frontmatter[1],
        path.posix.basename(path.posix.dirname(relative)),
        `${arm}/${relative} has a mismatched skill name.`,
      );
    }
    for (const match of source.matchAll(
      /\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/gu,
    )) {
      const target: string = path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), match[1]!),
      );
      assert.equal(
        materialized.has(target),
        true,
        `${arm}/${relative} links missing ${target}.`,
      );
    }
  }
};

main();
