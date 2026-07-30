import fs from "node:fs";
import path from "node:path";

/** Persists resumable benchmark state without a crash-loss window. */
export namespace EvidenceBenchmarkState {
  const NAME = "run.json";
  const PREVIOUS = "run.json.previous";

  /** Reads the current state or restores the last complete state journal. */
  export function read<T>(root: string, label: string): T {
    const target: string = path.join(root, NAME);
    const previous: string = path.join(root, PREVIOUS);
    if (!fs.existsSync(target) && fs.existsSync(previous))
      fs.renameSync(previous, target);
    if (!fs.existsSync(target))
      throw new Error(`${label} was not found: ${target}.`);
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  }

  /** Replaces the state while retaining one complete recovery generation. */
  export function write(root: string, value: unknown): void {
    const target: string = path.join(root, NAME);
    const previous: string = path.join(root, PREVIOUS);
    const temporary: string = path.join(
      root,
      `run.json.${process.pid}.${Date.now()}.tmp`,
    );
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.rmSync(previous, { force: true });
    if (fs.existsSync(target)) fs.renameSync(target, previous);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      if (!fs.existsSync(target) && fs.existsSync(previous))
        fs.renameSync(previous, target);
      throw error;
    }
    fs.rmSync(previous, { force: true });
  }
}
