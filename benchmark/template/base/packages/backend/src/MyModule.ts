import "reflect-metadata";

import { DynamicModule } from "@nestia/core";
import type { Type } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { ModuleMetadata } from "@nestjs/common/interfaces";
import type { INestiaConfig } from "@nestia/sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * Owns the one controller population shared by runtime and Nestia generation.
 */
export namespace MyModule {
  /**
   * Returns the authored TypeScript controller population for Nestia.
   *
   * @returns Include and exclude roots consumed by Nestia generation.
   */
  export const input = (): INestiaConfig.IInput => {
    const root: string = path.resolve(process.cwd(), "src", "controllers");
    assertDirectory(root, "Nestia controller source root");
    if (hasTypeScriptSource(root) === false)
      throw new Error(
        `Nestia controller source root contains no TypeScript source: ${root}.`,
      );
    if (hasNestControllerSource(root) === false)
      throw new Error(
        `Nestia controller source root contains no NestJS controller source: ${root}.`,
      );
    return {
      include: [root],
      exclude: [],
    };
  };

  /**
   * Discovers every runtime controller and mounts shared Nest metadata.
   *
   * @param metadata Shared imports, providers, exports, and module metadata.
   * @returns A Nest module containing the discovered controller population.
   */
  export const mount = async (
    metadata: Omit<ModuleMetadata, "controllers"> = {},
  ): Promise<Type<unknown>> => {
    const root: string = path.join(__dirname, "controllers");
    assertDirectory(root, "Runtime controller root");
    const module: Type<unknown> = await DynamicModule.mount(
      {
        include: [root],
        exclude: [],
      },
      metadata,
    );
    const controllers: readonly Type<unknown>[] = readControllers(module);
    if (controllers.length === 0)
      throw new Error(`No NestJS controller was discovered under ${root}.`);
    const identities: Set<Type<unknown>> = new Set(controllers);
    if (identities.size !== controllers.length)
      throw new Error(
        `A NestJS controller was discovered more than once under ${root}; export each controller from its defining file only.`,
      );
    return module;
  };
}

const assertDirectory = (root: string, label: string): void => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(root);
  } catch {
    throw new Error(`${label} does not exist: ${root}.`);
  }
  if (stats.isDirectory() === false)
    throw new Error(`${label} is not a directory: ${root}.`);
};

const hasTypeScriptSource = (root: string): boolean =>
  fs.readdirSync(root, { withFileTypes: true }).some((entry) => {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) return hasTypeScriptSource(location);
    if (entry.isFile() === false) return false;
    const lower: string = entry.name.toLowerCase();
    return (
      /\.(?:[cm]?ts)$/.test(lower) &&
      /\.(?:d\.[cm]?ts|d\.ts)$/.test(lower) === false
    );
  });

const hasNestControllerSource = (root: string): boolean =>
  fs.readdirSync(root, { withFileTypes: true }).some((entry) => {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) return hasNestControllerSource(location);
    if (
      entry.isFile() === false ||
      /\.(?:[cm]?ts)$/i.test(entry.name) === false ||
      /\.(?:d\.[cm]?ts|d\.ts)$/i.test(entry.name)
    )
      return false;
    return /(?:^|\n)\s*@(Typed)?Controller\s*\(/.test(
      fs.readFileSync(location, "utf8"),
    );
  });

const readControllers = (
  module: Type<unknown>,
): readonly Type<unknown>[] => {
  const value: unknown = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    module,
  );
  if (
    Array.isArray(value) === false ||
    value.some((controller) => typeof controller !== "function")
  )
    throw new Error(
      "Nestia DynamicModule returned invalid controller metadata.",
    );
  return value as Type<unknown>[];
};
