import { DynamicModule } from "@nestia/core";
import type { ModuleMetadata } from "@nestjs/common/interfaces";
import fs from "node:fs";
import path from "node:path";

/**
 * Owns the one controller population shared by runtime and Nestia generation.
 */
export namespace MyModule {
  /**
   * Discovers every runtime controller and mounts shared Nest metadata.
   *
   * @param metadata Shared imports, providers, exports, and module metadata.
   * @returns A Nest module containing the discovered controller population.
   */
  export const mount = async (
    metadata: Omit<ModuleMetadata, "controllers"> = {},
  ) => {
    const adjacent: string = path.join(__dirname, "controllers");
    const fromSource: boolean = fs.existsSync(adjacent) === false;
    const directory: string = fromSource
      ? path.join(process.cwd(), "src", "controllers")
      : adjacent;
    const module = await DynamicModule.mount(
      directory,
      metadata,
      fromSource || __filename.endsWith(".ts"),
    );
    const controllers: unknown = Reflect.getMetadata("controllers", module);
    if (Array.isArray(controllers) === false || controllers.length === 0)
      throw new Error(`No Nest controllers were discovered under ${directory}.`);
    return module;
  };
}
