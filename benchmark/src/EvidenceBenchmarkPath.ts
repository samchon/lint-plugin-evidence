import fs from "node:fs";
import path from "node:path";

/** Verifies that benchmark-owned paths never cross symbolic filesystem edges. */
export namespace EvidenceBenchmarkPath {
  /** Rejects a symbolic leaf while allowing a missing path. */
  export function assertSymlinkFree(location: string, label: string): string {
    const target: string = path.resolve(location);
    const stat: fs.Stats | undefined = fs.lstatSync(target, {
      throwIfNoEntry: false,
    });
    if (stat?.isSymbolicLink())
      throw new Error(`${label} is a symbolic filesystem edge: ${target}.`);
    return target;
  }

  /** Requires an existing real directory. */
  export function assertDirectory(location: string, label: string): string {
    const target: string = assertSymlinkFree(location, label);
    const stat: fs.Stats | undefined = fs.lstatSync(target, {
      throwIfNoEntry: false,
    });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error(`${label} is not a real directory: ${target}.`);
    return target;
  }

  /**
   * Requires lexical and physical containment below a real authority root. The
   * target itself may not exist yet, but every existing ancestor is checked.
   */
  export function assertInside(
    root: string,
    location: string,
    label: string,
  ): string {
    const authority: string = assertDirectory(root, `${label} authority`);
    const target: string = assertSymlinkFree(location, label);
    const relation: string = path.relative(authority, target);
    if (
      relation === "" ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    )
      throw new Error(`${label} escaped its authority: ${target}.`);

    let existing: string = authority;
    for (const segment of relation.split(path.sep)) {
      const candidate: string = path.join(existing, segment);
      const stat: fs.Stats | undefined = fs.lstatSync(candidate, {
        throwIfNoEntry: false,
      });
      if (stat === undefined) break;
      if (stat.isSymbolicLink())
        throw new Error(
          `${label} crosses a symbolic filesystem edge: ${candidate}.`,
        );
      if (candidate !== target && !stat.isDirectory())
        throw new Error(
          `${label} crosses a non-directory component: ${candidate}.`,
        );
      existing = candidate;
    }
    const physicalRoot: string = fs.realpathSync(authority);
    const physicalExisting: string = fs.realpathSync(existing);
    const physicalRelation: string = path.relative(
      physicalRoot,
      physicalExisting,
    );
    if (
      physicalRelation === ".." ||
      physicalRelation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(physicalRelation)
    )
      throw new Error(`${label} escaped its physical authority: ${target}.`);
    return target;
  }
}
