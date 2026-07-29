import "reflect-metadata";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { Injectable } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";

import { MyBackend } from "../MyBackend";
import { MyModule } from "../MyModule";

@Injectable()
class DiscoveryProofProvider {
  public readonly value: string = "provider-mounted";
}

const main = async (): Promise<void> => {
  const input = MyModule.input();
  const expectedSourceRoot: string = path.resolve(
    process.cwd(),
    "src",
    "controllers",
  );
  assert.deepEqual(input, {
    include: [expectedSourceRoot],
    exclude: [],
  });

  const module = await MyModule.mount({
    providers: [DiscoveryProofProvider],
  });
  const controllers: unknown = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    module,
  );
  assert.ok(Array.isArray(controllers));
  assert.deepEqual(controllers.map((controller) => controller.name).sort(), [
    "HealController",
    "NestedDiscoveryController",
  ]);
  assert.equal(new Set(controllers).size, controllers.length);

  const application = await NestFactory.create(module, { logger: false });
  try {
    assert.equal(
      application.get(DiscoveryProofProvider).value,
      "provider-mounted",
    );
  } finally {
    await application.close();
  }

  const backend = new MyBackend();
  await backend.open();
  try {
    const host: string = `http://127.0.0.1:${process.env.API_PORT}`;
    const health: Response = await fetch(`${host}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "OK");
    const nested: Response = await fetch(`${host}/discovery/nested`);
    assert.equal(nested.status, 200);
    assert.deepEqual(await nested.json(), { source: "nested" });
  } finally {
    await backend.close();
  }

  const runtimeRoot: string = path.resolve(__dirname, "../controllers");
  await withMissingAndEmptyDirectory(
    runtimeRoot,
    async () => {
      await assert.rejects(
        () => MyModule.mount(),
        (error: unknown) =>
          namesRoot(
            error,
            "Runtime controller root does not exist",
            runtimeRoot,
          ),
      );
    },
    async () => {
      await assert.rejects(
        () => MyModule.mount(),
        (error: unknown) =>
          namesRoot(error, "No NestJS controller was discovered", runtimeRoot),
      );
    },
  );

  if (process.env.DISCOVERY_PROOF_SOURCE === "1")
    await withMissingAndEmptyDirectory(
      expectedSourceRoot,
      async () => {
        assert.throws(
          () => MyModule.input(),
          (error: unknown) =>
            namesRoot(
              error,
              "Nestia controller source root does not exist",
              expectedSourceRoot,
            ),
        );
      },
      async () => {
        assert.throws(
          () => MyModule.input(),
          (error: unknown) =>
            namesRoot(
              error,
              "contains no TypeScript source",
              expectedSourceRoot,
            ),
        );
      },
    );
};

const withMissingAndEmptyDirectory = async (
  root: string,
  missing: () => Promise<void>,
  empty: () => Promise<void>,
): Promise<void> => {
  const backup: string = `${root}.discovery-proof-backup`;
  assert.equal(fs.existsSync(backup), false);
  fs.renameSync(root, backup);
  try {
    await missing();
    fs.mkdirSync(root);
    await empty();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.renameSync(backup, root);
  }
};

const namesRoot = (error: unknown, fragment: string, root: string): boolean =>
  error instanceof Error &&
  error.message.includes(fragment) &&
  error.message.includes(root);

await main();
