import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/** Durable atomic JSON checkpoints and append-only semantic event records. */
export namespace EvidenceBenchmarkCodexCheckpoint {
  /**
   * Replaces one JSON checkpoint through a flushed sibling file.
   *
   * The prior checkpoint remains intact if serialization, write, or rename
   * fails, so restart never consumes a partially rewritten object.
   */
  export async function write(target: string, value: unknown): Promise<void> {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${EvidenceBenchmarkCodexValue.sha256(
      `${process.hrtime.bigint()}`,
    ).slice(0, 12)}.next`;
    const handle = await fs.promises.open(temporary, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.promises.rename(temporary, target);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true });
      throw error;
    }
  }

  /** Creates one immutable JSON seal atomically and rejects every overwrite. */
  export async function writeOnce(
    target: string,
    value: unknown,
  ): Promise<void> {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${EvidenceBenchmarkCodexValue.sha256(
      `${process.hrtime.bigint()}`,
    ).slice(0, 12)}.next`;
    const handle = await fs.promises.open(temporary, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.promises.link(temporary, target);
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  }

  /** Reads and parses a checkpoint, returning undefined when it does not exist. */
  export async function read<T>(target: string): Promise<T | undefined> {
    try {
      const source = await fs.promises.readFile(target, "utf8");
      return JSON.parse(source) as T;
    } catch (error) {
      if (
        EvidenceBenchmarkCodexValue.isRecord(error) &&
        error.code === "ENOENT"
      )
        return undefined;
      throw error;
    }
  }

  /** Appends one newline-delimited JSON event without rewriting prior records. */
  export async function append(target: string, value: unknown): Promise<void> {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const handle = await fs.promises.open(target, "a");
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
