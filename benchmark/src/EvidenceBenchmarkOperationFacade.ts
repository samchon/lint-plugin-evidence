import type { IEvidenceBenchmarkOperationAdapter } from "./structures/IEvidenceBenchmarkOperationAdapter.ts";

/**
 * Loads the fixed production runner facade without providing a direct Codex
 * fallback.
 */
export namespace EvidenceBenchmarkOperationFacade {
  /**
   * Resolves the admitted production integration.
   *
   * The module must build `EvidenceBenchmarkCodexRunner` with
   * `EvidenceBenchmarkCodexLaunchGate.validate`; a missing or incompatible
   * facade blocks launch instead of spawning Codex from the CLI.
   */
  export async function load(): Promise<IEvidenceBenchmarkOperationAdapter> {
    const specifier: string = new URL(
      "./codex/EvidenceBenchmarkCodexOperation.ts",
      import.meta.url,
    ).href;
    let imported: unknown;
    try {
      imported = await import(specifier);
    } catch (error) {
      throw new Error(
        "Production benchmark runner facade is unavailable; paid launch remains blocked.",
        { cause: error },
      );
    }
    if (
      !isObject(imported) ||
      !isObject(imported.EvidenceBenchmarkCodexOperation) ||
      typeof imported.EvidenceBenchmarkCodexOperation.create !== "function"
    )
      throw new Error(
        "Production benchmark runner facade has an incompatible export.",
      );
    const adapter: unknown =
      await imported.EvidenceBenchmarkCodexOperation.create();
    if (
      !isObject(adapter) ||
      typeof adapter.run !== "function" ||
      typeof adapter.abort !== "function" ||
      typeof adapter.observe !== "function" ||
      typeof adapter.sealInterrupted !== "function" ||
      typeof adapter.grade !== "function" ||
      typeof adapter.report !== "function"
    )
      throw new Error(
        "Production benchmark runner facade does not implement the complete operation contract.",
      );
    return adapter as unknown as IEvidenceBenchmarkOperationAdapter;
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
