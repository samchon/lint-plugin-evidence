import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Provides fsynced write-once publication for benchmark safety artifacts. */
export namespace EvidenceBenchmarkDurability {
  /**
   * Publishes complete bytes through an fsynced temporary file and hard link.
   *
   * A crash before the link leaves only an identifiable orphan temporary file;
   * a crash after the link leaves a complete immutable target.
   */
  export function writeOnce(
    location: string,
    content: string | Uint8Array,
  ): void {
    const target: string = path.resolve(location);
    const directory: string = path.dirname(target);
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(target))
      throw new Error(`Benchmark write-once target exists: ${target}.`);
    const temporary: string = path.join(
      directory,
      `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.orphan`,
    );
    let handle: number | null = null;
    try {
      handle = fs.openSync(temporary, "wx");
      fs.writeFileSync(handle, content);
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      fs.linkSync(temporary, target);
      syncDirectory(directory);
    } finally {
      if (handle !== null) fs.closeSync(handle);
      if (fs.existsSync(temporary)) {
        fs.unlinkSync(temporary);
        syncDirectory(directory);
      }
    }
  }

  /** Fsyncs a directory where supported and rejects unexpected failures. */
  export function syncDirectory(directory: string): void {
    let handle: number | null = null;
    try {
      handle = fs.openSync(directory, "r");
      fs.fsyncSync(handle);
    } catch (error) {
      if (!(
        process.platform === "win32" &&
        isNodeError(error) &&
        typeof error.code === "string" &&
        ["EPERM", "EACCES", "EINVAL"].includes(error.code)
      ))
        throw error;
    } finally {
      if (handle !== null) fs.closeSync(handle);
    }
  }

  function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
  }
}
