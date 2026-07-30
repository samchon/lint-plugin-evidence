import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Captures and verifies exact benchmark lint configuration bytes. */
export namespace EvidenceBenchmarkLintBaseline {
  /** Package lint configurations whose exact bytes are campaign inputs. */
  export const PATHS = [
    "packages/api/lint.config.ts",
    "packages/backend/lint.config.ts",
    "packages/frontend/lint.config.ts",
    "packages/backend/lint.config.main.ts",
  ] as const;

  /** API, canonical backend, and source-program projection final identities. */
  export const BACKEND_PATHS: readonly string[] = [
    PATHS[0],
    PATHS[1],
    PATHS[3],
  ];

  /** Captures exact bytes from an in-memory tree. */
  export function capture(
    files: ReadonlyMap<string, Uint8Array>,
    _arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
    return PATHS.map((relative) => {
      const content: Uint8Array | undefined = files.get(relative);
      if (content === undefined)
        throw new Error(
          `Benchmark lint baseline source is missing: ${relative}.`,
        );
      return {
        path: relative,
        sha256: EvidenceBenchmarkHash.bytes(content),
      };
    });
  }

  /** Captures the canonical and projected lint configurations from a workspace. */
  export function captureDirectory(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
    return capture(
      new Map(
        PATHS.map((relative) => {
          const location: string = path.join(workspace, ...relative.split("/"));
          const stat: fs.Stats | undefined = fs.lstatSync(location, {
            throwIfNoEntry: false,
          });
          if (!stat?.isFile() || stat.isSymbolicLink())
            throw new Error(
              `Benchmark lint configuration is not a regular file: ${relative}.`,
            );
          return [relative, fs.readFileSync(location)] as const;
        }),
      ),
      arm,
    );
  }

  /**
   * Requires selected configurations to match their sealed exact bytes.
   *
   * The actual lint command owns rule semantics. This gate only proves that a
   * measured workspace restored the campaign input before that command runs.
   */
  export function assertRestored(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
    selected: readonly string[] = PATHS,
  ): string {
    validateBaselines(baselines);
    const expected: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(baselines.map((entry) => [entry.path, entry]));
    const actual: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(
      captureDirectory(workspace, arm).map((entry) => [entry.path, entry]),
    );
    for (const relative of selected) {
      const before = expected.get(relative);
      const after = actual.get(relative);
      if (before === undefined || after === undefined)
        throw new Error(
          `Unknown lint restoration path requested: ${relative}.`,
        );
      if (after.sha256 !== before.sha256)
        throw new Error(
          `Lint configuration bytes were not restored for ${relative}: expected ${before.sha256}, received ${after.sha256}.`,
        );
    }
    return digest(baselines, selected);
  }

  /** Returns the sealed identity for a selected restoration gate. */
  export function digest(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
    selected: readonly string[] = PATHS,
  ): string {
    const entries: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(baselines.map((entry) => [entry.path, entry]));
    return EvidenceBenchmarkHash.object(
      selected.map((relative) => {
        const entry = entries.get(relative);
        if (entry === undefined)
          throw new Error(`Unknown lint baseline path requested: ${relative}.`);
        return entry;
      }),
    );
  }

  function validateBaselines(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
  ): void {
    if (
      JSON.stringify(baselines.map((entry) => entry.path)) !==
      JSON.stringify(PATHS)
    )
      throw new Error(
        "Benchmark lint baselines do not contain the canonical package inventory and source-program projection.",
      );
  }
}
