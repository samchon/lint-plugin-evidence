import fs from "node:fs";

/** Publishes completed benchmark directories across transient host file locks. */
export namespace EvidenceBenchmarkAtomic {
  /**
   * Atomically renames a complete sibling stage with bounded lock retries.
   *
   * Windows can retain a child-process file handle briefly after process close.
   * Only transient access failures retry; every other rename failure is
   * reported immediately and the caller retains ownership of stage cleanup.
   */
  export async function publish(stage: string, output: string): Promise<void> {
    const deadline: number = Date.now() + 10_000;
    for (;;) {
      try {
        await fs.promises.rename(stage, output);
        return;
      } catch (error) {
        if (
          !(
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error.code === "EPERM" || error.code === "EACCES")
          ) ||
          Date.now() >= deadline
        )
          throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
