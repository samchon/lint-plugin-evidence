import assert from "node:assert/strict";
import net from "node:net";

import { EvidenceBenchmarkRuntime } from "../../../../benchmark/src/EvidenceBenchmarkRuntime.ts";

/** Verifies every benchmark cell owns one stable, unavailable-before-use block. */
export const test_benchmark_runtime = async (): Promise<void> => {
  const assignments: EvidenceBenchmarkRuntime.IAssignment[] = [];
  for (const subject of ["todo", "reddit", "shopping", "erp"] as const)
    for (const arm of ["evidence", "plain"] as const)
      assignments.push(EvidenceBenchmarkRuntime.assign(subject, arm));

  const ports: number[] = assignments.flatMap((assignment) => [
    assignment.apiPort,
    assignment.swaggerPort,
    assignment.viteDevelopmentPort,
    assignment.playwrightPort,
  ]);
  assert.equal(new Set(ports).size, ports.length);
  assert.deepEqual(EvidenceBenchmarkRuntime.assign("reddit", "plain", 50_000), {
    apiPort: 50_030,
    swaggerPort: 50_031,
    viteDevelopmentPort: 50_032,
    playwrightPort: 50_033,
    apiHost: "http://127.0.0.1:50030",
  });
  assert.throws(
    () => EvidenceBenchmarkRuntime.assign("unknown", "plain"),
    /Unknown benchmark cell/u,
  );
  assert.throws(
    () => EvidenceBenchmarkRuntime.assign("erp", "plain", 65_463),
    /between 1 and 65462/u,
  );

  const environment: NodeJS.ProcessEnv = {
    API_PORT: "37001",
    PLAYWRIGHT_TEST_PORT: "4173",
  };
  EvidenceBenchmarkRuntime.apply(environment, assignments[0]!);
  assert.deepEqual(environment, {
    API_PORT: "46000",
    PLAYWRIGHT_TEST_PORT: "46003",
    SWAGGER_PORT: "46001",
    VITE_API_HOST: "http://127.0.0.1:46000",
    VITE_DEV_PORT: "46002",
  });
  assert.equal(
    EvidenceBenchmarkRuntime.equals(assignments[0], { ...assignments[0]! }),
    true,
  );

  const blocked: EvidenceBenchmarkRuntime.IAssignment = assignments[0]!;
  const server: net.Server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      { host: "127.0.0.1", port: blocked.apiPort, exclusive: true },
      resolve,
    );
  });
  try {
    await assert.rejects(
      EvidenceBenchmarkRuntime.assertAvailable([blocked]),
      new RegExp(`api port ${blocked.apiPort} is unavailable`, "u"),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
  await EvidenceBenchmarkRuntime.assertAvailable(assignments);
};
