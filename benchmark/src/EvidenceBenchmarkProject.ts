import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Validates portable benchmark subject identities and their requirement roots. */
export namespace EvidenceBenchmarkProject {
  const PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
  const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

  /** Parses one filesystem- and package-safe subject slug without a fixed list. */
  export function parse(
    input: string,
  ): IEvidenceBenchmarkMaterialization.Project {
    if (!PATTERN.test(input) || WINDOWS_DEVICE.test(input))
      throw new Error(
        `Invalid benchmark project slug: ${input}. Use 1-63 lowercase letters, digits, or hyphens and avoid Windows device names.`,
      );
    return input;
  }

  /** Requires the selected subject to own a regular requirements directory. */
  export function requireCorpus(
    repository: string,
    input: string,
  ): IEvidenceBenchmarkMaterialization.Project {
    const project: IEvidenceBenchmarkMaterialization.Project = parse(input);
    const root: string = path.join(
      path.resolve(repository),
      "benchmark",
      "requirements",
      project,
    );
    const stat: fs.Stats | undefined = fs.lstatSync(root, {
      throwIfNoEntry: false,
    });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        `Benchmark requirement corpus is not a regular directory: ${root}.`,
      );
    return project;
  }
}
