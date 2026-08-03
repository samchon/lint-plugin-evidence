import assert from "node:assert/strict";

import {
  createProductSwagger,
  defineTestOperationScenarioRegistry,
  parseProductOperations,
  TestOperationScenario,
  validateTestOperationScenarios,
} from "../../../benchmark/template/base/packages/backend/test/helpers/TestOperationScenario.ts";

const accessor = (method: string, route: string) => {
  const closure = async (): Promise<unknown> => undefined;
  return Object.assign(closure, {
    METADATA: { method, path: route },
  });
};

const health = accessor("GET", "/health");
const read = accessor("GET", "/items/:id");
const update = accessor("PATCH", "/items/:id");
const typedRead = Object.assign(
  async (
    connection: { host: string },
    props: { id: string },
  ): Promise<string> => `${connection.host}/${props.id}`,
  { METADATA: { method: "GET", path: "/typed/:id" } },
);
const typedHost = TestOperationScenario.define({
  target: typedRead,
  intent: "success",
  body: async ({ connection, target }) => {
    await target(connection, { id: "one" });
  },
});
await typedHost({ host: "http://127.0.0.1" });
const sdk = {
  health: { get: health },
  items: { at: read, update },
};
const swagger = {
  openapi: "3.1.0",
  paths: {
    "/health": { get: {}, post: {} },
    "/items/{id}": { get: {}, patch: {} },
  },
};
const product = createProductSwagger(swagger);
assert.deepEqual(parseProductOperations(product), [
  "GET /items/{id}",
  "PATCH /items/{id}",
  "POST /health",
]);
assert.deepEqual(swagger.paths["/health"], { get: {}, post: {} });

const readSuccess = TestOperationScenario.define({
  target: read,
  intent: "success",
  body: async ({ target }) => {
    await target();
  },
});
const readMissing = TestOperationScenario.define({
  target: read,
  intent: "business-rejection",
  body: async ({ target }) => {
    await target();
  },
});
const updateSuccess = TestOperationScenario.define({
  target: update,
  intent: "success",
  body: async ({ target }) => {
    await target();
  },
});
const updateForbidden = TestOperationScenario.define({
  target: update,
  intent: "authorization",
  body: async ({ target }) => {
    await target();
  },
});
await Promise.all([
  readSuccess(undefined),
  readMissing(undefined),
  updateSuccess(undefined),
  updateForbidden(undefined),
]);

const execution = (
  name: string,
  host: unknown,
  requests: readonly { method: string; path: string }[],
) => ({
  name,
  location: `/test/features/api/items/${name}.ts`,
  exports: { [name]: host },
  requests,
});
const valid = validateTestOperationScenarios({
  inventory: ["GET /items/{id}", "PATCH /items/{id}"],
  sdk,
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
    test_api_item_read_missing: readMissing,
    test_api_item_update: updateSuccess,
    test_api_item_update_forbidden: updateForbidden,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/search" },
      { method: "GET", path: "/items/one" },
      { method: "PATCH", path: "/items/follow-up" },
    ]),
    execution("test_api_item_read_missing", readMissing, [
      { method: "GET", path: "/items/missing" },
    ]),
    execution("test_api_item_update", updateSuccess, [
      { method: "GET", path: "/items/one" },
      { method: "PATCH", path: "/items/one" },
      { method: "GET", path: "/items/one" },
    ]),
    execution("test_api_item_update_forbidden", updateForbidden, [
      { method: "PATCH", path: "/items/one" },
    ]),
    execution("test_api_health", async () => undefined, [
      { method: "GET", path: "/health" },
    ]),
  ],
});
assert.deepEqual(valid.errors, []);
assert.deepEqual(valid.excluded, [
  { host: "test_api_health", operation: "GET /health" },
]);
assert.ok(valid.executed.every((entry) => entry.primaryInvocations === 1));

const single = validateTestOperationScenarios({
  inventory: ["GET /items/{id}"],
  sdk: { items: { at: read } },
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/one" },
    ]),
  ],
});
assert.ok(
  single.errors.some((error) =>
    error.includes("has 1 distinct exported test hosts"),
  ),
);
assert.ok(
  single.errors.some((error) =>
    error.includes("has no distinct non-success intent"),
  ),
);

const readSuccessTwin = TestOperationScenario.define({
  target: read,
  intent: "success",
  body: async ({ target }) => {
    await target();
  },
});
await readSuccessTwin(undefined);
const sameIntentPair = validateTestOperationScenarios({
  inventory: ["GET /items/{id}"],
  sdk: { items: { at: read } },
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
    test_api_item_read_twin: readSuccessTwin,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/one" },
    ]),
    execution("test_api_item_read_twin", readSuccessTwin, [
      { method: "GET", path: "/items/two" },
    ]),
  ],
});
assert.ok(
  sameIntentPair.errors.some((error) =>
    error.includes("has no distinct non-success intent"),
  ),
);

const readMissingTwin = TestOperationScenario.define({
  target: read,
  intent: "business-rejection",
  body: async ({ target }) => {
    await target();
  },
});
await readMissingTwin(undefined);
const repeatedAdditionalIntent = validateTestOperationScenarios({
  inventory: ["GET /items/{id}"],
  sdk: { items: { at: read } },
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
    test_api_item_read_missing: readMissing,
    test_api_item_read_missing_twin: readMissingTwin,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/one" },
    ]),
    execution("test_api_item_read_missing", readMissing, [
      { method: "GET", path: "/items/missing" },
    ]),
    execution("test_api_item_read_missing_twin", readMissingTwin, [
      { method: "GET", path: "/items/also-missing" },
    ]),
  ],
});
assert.deepEqual(repeatedAdditionalIntent.errors, []);

const fakeTarget = accessor("GET", "/items/:id");
const fakeHost = TestOperationScenario.define({
  target: fakeTarget,
  intent: "success",
  body: async ({ target }) => {
    await target();
  },
});
const rawRouteHost = TestOperationScenario.define({
  target: read,
  intent: "business-rejection",
  body: async () => undefined,
});
const duplicateHost = TestOperationScenario.define({
  target: read,
  intent: "success",
  body: async ({ target }) => {
    await target();
    await target();
  },
});
await Promise.all([
  fakeHost(undefined),
  rawRouteHost(undefined),
  duplicateHost(undefined),
]);
const unbranded = async (): Promise<void> => undefined;
const invalid = validateTestOperationScenarios({
  inventory: ["GET /items/{id}", "PATCH /items/{id}"],
  sdk,
  registry: defineTestOperationScenarioRegistry({
    test_api_item_fake: fakeHost,
    test_api_item_raw: rawRouteHost,
    test_api_item_duplicate: duplicateHost,
    test_api_item_duplicate_alias: duplicateHost,
  }),
  executions: [
    execution("test_api_item_fake", fakeHost, [
      { method: "GET", path: "/items/one" },
    ]),
    {
      ...execution("test_api_item_raw", rawRouteHost, [
        { method: "GET", path: "/items/search" },
      ]),
      exports: { helper: unbranded, test_api_item_raw: rawRouteHost },
    },
    execution("test_api_item_duplicate", duplicateHost, [
      { method: "GET", path: "/items/one" },
    ]),
    execution("test_api_item_unbranded", unbranded, [
      { method: "GET", path: "/items/one" },
    ]),
  ],
});
assert.ok(
  invalid.errors.some((error) =>
    error.includes("does not target an accessor from the generated SDK"),
  ),
);
assert.ok(
  invalid.errors.some((error) => error.includes("registered more than once")),
);
assert.ok(
  invalid.errors.some((error) =>
    error.includes("must expose exactly its registered branded host"),
  ),
);
assert.ok(
  invalid.errors.some((error) =>
    error.includes("invoked its generated primary target 0 times"),
  ),
);
assert.ok(
  invalid.errors.some((error) =>
    error.includes("invoked its generated primary target 2 times"),
  ),
);
assert.ok(
  invalid.errors.some((error) =>
    error.includes("is not a registered branded scenario"),
  ),
);

const plannedButSkipped = validateTestOperationScenarios({
  inventory: ["GET /items/{id}"],
  sdk: { items: { at: read } },
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
    test_api_item_read_missing: readMissing,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/one" },
    ]),
  ],
});
assert.ok(
  plannedButSkipped.errors.some((error) =>
    error.includes("test_api_item_read_missing executed 0 times"),
  ),
);

const unsupportedIntent = TestOperationScenario.define({
  target: read,
  intent: "ownership",
  body: async ({ target }) => {
    await target();
  },
});
const scenarioSymbol: symbol =
  Object.getOwnPropertySymbols(unsupportedIntent)[0]!;
const unsupportedRuntime = (
  unsupportedIntent as unknown as Record<symbol, { intent: string }>
)[scenarioSymbol]!;
unsupportedRuntime.intent = "not-found";
await unsupportedIntent(undefined);
const unsupported = validateTestOperationScenarios({
  inventory: ["GET /items/{id}"],
  sdk: { items: { at: read } },
  registry: defineTestOperationScenarioRegistry({
    test_api_item_read: readSuccess,
    test_api_item_unsupported: unsupportedIntent,
  }),
  executions: [
    execution("test_api_item_read", readSuccess, [
      { method: "GET", path: "/items/one" },
    ]),
    execution("test_api_item_unsupported", unsupportedIntent, [
      { method: "GET", path: "/items/two" },
    ]),
  ],
});
assert.ok(
  unsupported.errors.some((error) =>
    error.includes('unsupported intent "not-found"'),
  ),
);
assert.ok(
  invalid.errors.some((error) =>
    error.includes("PATCH /items/{id} has 0 distinct exported test hosts"),
  ),
);
