import fs from "node:fs";
import path from "node:path";

const HTTP_METHODS = [
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
] as const;
const OPERATION_INTENTS = [
  "success",
  "observable-effect",
  "business-rejection",
  "authorization",
  "ownership",
  "lifecycle",
  "duplicate-conflict",
  "collection-query",
] as const;
const SCENARIO: unique symbol = Symbol("TestOperationScenario");

type RuntimeFunction = (...args: never[]) => unknown;

/** Allowed behavioral intent for a product-operation scenario. */
export type TestOperationIntent = (typeof OPERATION_INTENTS)[number];

/** Metadata carried by every generated SDK operation accessor. */
export interface IGeneratedOperationAccessor extends RuntimeFunction {
  readonly METADATA: {
    readonly method: string;
    readonly path: string;
  };
}

/** One HTTP request observed while an exported test host was running. */
export interface ITestOperationRequest {
  readonly method: string;
  readonly path: string;
}

/** Runtime facts for one dynamically executed test host. */
export interface ITestOperationExecution {
  readonly name: string;
  readonly location: string;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly requests: readonly ITestOperationRequest[];
}

/** A branded exported host that owns exactly one generated primary target. */
export interface ITestOperationScenarioHost extends RuntimeFunction {
  readonly [SCENARIO]: ITestOperationScenarioRuntime;
}

/** Machine-readable result of the product-operation scenario gate. */
export interface ITestOperationScenarioReport {
  readonly schemaVersion: 1;
  readonly inventory: readonly string[];
  readonly generated: readonly {
    readonly accessor: string;
    readonly operation: string;
  }[];
  readonly planned: readonly {
    readonly host: string;
    readonly intent: string;
    readonly operation: string | null;
  }[];
  readonly executed: readonly {
    readonly host: string;
    readonly location: string;
    readonly operation: string | null;
    readonly primaryInvocations: number | null;
    readonly requests: readonly ITestOperationRequest[];
  }[];
  readonly excluded: readonly {
    readonly host: string;
    readonly operation: string;
  }[];
  readonly errors: readonly string[];
}

interface IGeneratedOperation {
  readonly accessor: IGeneratedOperationAccessor;
  readonly name: string;
  readonly operation: string;
}

interface ITestOperationScenarioRuntime {
  readonly intent: string;
  readonly target: IGeneratedOperationAccessor;
  primaryInvocations: number;
}

/** Defines a scenario host whose primary call must use the injected target. */
export namespace TestOperationScenario {
  /** Defines and brands one exported product-operation scenario host. */
  export const define = <Target extends IGeneratedOperationAccessor>(props: {
    readonly target: Target;
    readonly intent: TestOperationIntent;
    readonly body: (props: {
      readonly connection: Parameters<Target>[0];
      readonly target: Target;
    }) => Promise<void>;
  }): ((connection: Parameters<Target>[0]) => Promise<void>) &
    ITestOperationScenarioHost => {
    const runtime: ITestOperationScenarioRuntime = {
      intent: props.intent,
      target: props.target,
      primaryInvocations: 0,
    };
    const host = async (connection: Parameters<Target>[0]): Promise<void> => {
      runtime.primaryInvocations = 0;
      const target: Target = new Proxy(props.target, {
        apply: (accessor, thisArgument, argumentsList) => {
          runtime.primaryInvocations++;
          return Reflect.apply(accessor, thisArgument, argumentsList);
        },
      });
      await props.body({ connection, target });
    };
    Object.defineProperty(host, SCENARIO, {
      enumerable: false,
      value: runtime,
    });
    return host as typeof host & ITestOperationScenarioHost;
  };
}

/** Preserves tuple inference for the actual branded exported hosts. */
export const defineTestOperationScenarioRegistry = <
  const Hosts extends Readonly<Record<string, ITestOperationScenarioHost>>,
>(
  hosts: Hosts,
): Hosts => hosts;

/** Removes only the fixed scaffold health operation from a Swagger document. */
export const createProductSwagger = (input: unknown): unknown => {
  if (!isRecord(input) || !isRecord(input.paths))
    throw new Error("The generated Swagger document has no paths object.");
  const output: Record<string, unknown> = structuredClone(input);
  if (!isRecord(output.paths))
    throw new Error("The cloned Swagger document has no paths object.");
  const health: unknown = output.paths["/health"];
  if (isRecord(health)) {
    delete health.get;
    if (HTTP_METHODS.every((method) => health[method] === undefined))
      delete output.paths["/health"];
  }
  return output;
};

/** Writes the deterministic product-operation Swagger artifact. */
export const writeProductSwagger = (props: {
  input: string;
  output: string;
}): void => {
  const document: unknown = JSON.parse(fs.readFileSync(props.input, "utf8"));
  const product: unknown = createProductSwagger(document);
  fs.writeFileSync(props.output, `${JSON.stringify(product, null, 2)}\n`);
};

/** Reads the complete operation inventory from the product Swagger artifact. */
export const readProductOperations = (location: string): readonly string[] => {
  const document: unknown = JSON.parse(fs.readFileSync(location, "utf8"));
  return parseProductOperations(document);
};

/** Parses and sorts all operations declared by a product Swagger document. */
export const parseProductOperations = (
  document: unknown,
): readonly string[] => {
  if (!isRecord(document) || !isRecord(document.paths))
    throw new Error("The product Swagger document has no paths object.");
  const operations: string[] = [];
  for (const [route, item] of Object.entries(document.paths)) {
    if (!isRecord(item)) continue;
    for (const method of HTTP_METHODS)
      if (isRecord(item[method])) operations.push(operationKey(method, route));
  }
  return operations.sort((x, y) => x.localeCompare(y));
};

/** Validates product inventory, plans, exports, and primary target calls. */
export const validateTestOperationScenarios = (props: {
  readonly inventory: readonly string[];
  readonly sdk: unknown;
  readonly registry: Readonly<Record<string, ITestOperationScenarioHost>>;
  readonly executions: readonly ITestOperationExecution[];
}): ITestOperationScenarioReport => {
  const errors: string[] = [];
  const inventory: string[] = [...props.inventory].sort((x, y) =>
    x.localeCompare(y),
  );
  const inventorySet: Set<string> = new Set(inventory);
  if (inventorySet.size !== inventory.length)
    errors.push("Product Swagger contains duplicate operation identities.");

  const generated: IGeneratedOperation[] = discoverGeneratedOperations(
    props.sdk,
  ).filter((operation) => operation.operation !== "GET /health");
  const generatedByAccessor: Map<RuntimeFunction, IGeneratedOperation> =
    new Map();
  const generatedByOperation: Map<string, IGeneratedOperation[]> = new Map();
  for (const operation of generated) {
    generatedByAccessor.set(operation.accessor, operation);
    const siblings: IGeneratedOperation[] =
      generatedByOperation.get(operation.operation) ?? [];
    siblings.push(operation);
    generatedByOperation.set(operation.operation, siblings);
  }
  for (const operation of inventory)
    if (!generatedByOperation.has(operation))
      errors.push(
        `Product Swagger operation ${operation} has no generated SDK accessor.`,
      );
  for (const [operation, accessors] of generatedByOperation) {
    if (!inventorySet.has(operation))
      errors.push(
        `Generated SDK operation ${operation} is absent from product Swagger.`,
      );
    if (accessors.length !== 1)
      errors.push(
        `Generated SDK operation ${operation} has ${accessors.length} accessors; expected exactly one.`,
      );
  }

  const exportedNameByHost: Map<object, string> = new Map();
  const executionByHost: Map<string, ITestOperationExecution[]> = new Map();
  const excluded: Array<{ host: string; operation: string }> = [];
  for (const execution of props.executions) {
    for (const [name, value] of Object.entries(execution.exports))
      if (typeof value === "function") {
        const previous: string | undefined = exportedNameByHost.get(value);
        if (previous !== undefined && previous !== name)
          errors.push(
            `One test host is exported as both ${previous} and ${name}.`,
          );
        else exportedNameByHost.set(value, name);
      }
    if (isHealthExecution(execution)) {
      excluded.push({ host: execution.name, operation: "GET /health" });
      continue;
    }
    const siblings: ITestOperationExecution[] =
      executionByHost.get(execution.name) ?? [];
    siblings.push(execution);
    executionByHost.set(execution.name, siblings);
  }

  const registrySet: Set<RuntimeFunction> = new Set();
  const scenarioByHost: Map<string, ITestOperationScenarioRuntime> = new Map();
  const scenariosByOperation: Map<
    string,
    Array<{ host: string; runtime: ITestOperationScenarioRuntime }>
  > = new Map();
  const planned = Object.entries(props.registry).map(([name, host]) => {
    const runtime: ITestOperationScenarioRuntime = host[SCENARIO];
    const exportedName: string | undefined = exportedNameByHost.get(host);
    const generatedOperation: IGeneratedOperation | undefined =
      generatedByAccessor.get(runtime.target);
    const operation: string | null = generatedOperation?.operation ?? null;
    if (registrySet.has(host))
      errors.push(`Scenario host ${name} is registered more than once.`);
    registrySet.add(host);
    if (exportedName === undefined)
      errors.push(
        `Registered scenario host ${name} is not an executed module export.`,
      );
    else if (exportedName !== name)
      errors.push(
        `Registered binding ${name} is exported by its test module as ${exportedName}.`,
      );
    if (scenarioByHost.has(name))
      errors.push(`Exported test host ${name} owns more than one scenario.`);
    else scenarioByHost.set(name, runtime);
    if (!isOperationIntent(runtime.intent))
      errors.push(
        `Scenario ${name} has unsupported intent ${JSON.stringify(runtime.intent)}.`,
      );
    if (generatedOperation === undefined)
      errors.push(
        `Scenario ${name} does not target an accessor from the generated SDK.`,
      );
    else if (!inventorySet.has(generatedOperation.operation))
      errors.push(
        `Scenario ${name} targets non-product operation ${generatedOperation.operation}.`,
      );
    else {
      const siblings =
        scenariosByOperation.get(generatedOperation.operation) ?? [];
      siblings.push({ host: name, runtime });
      scenariosByOperation.set(generatedOperation.operation, siblings);
    }
    return { host: name, intent: runtime.intent, operation };
  });

  for (const operation of inventory) {
    const scenarios = scenariosByOperation.get(operation) ?? [];
    const hosts: Set<string> = new Set(
      scenarios.map((scenario) => scenario.host),
    );
    const intents: Set<string> = new Set(
      scenarios.map((scenario) => scenario.runtime.intent),
    );
    if (hosts.size < 2)
      errors.push(
        `Product operation ${operation} has ${hosts.size} distinct exported test hosts; expected at least 2.`,
      );
    if (!intents.has("success"))
      errors.push(`Product operation ${operation} has no success scenario.`);
    if ([...intents].every((intent) => intent === "success"))
      errors.push(
        `Product operation ${operation} has no distinct non-success intent.`,
      );
  }

  const executed = props.executions
    .filter((execution) => !isHealthExecution(execution))
    .map((execution) => {
      const runtime: ITestOperationScenarioRuntime | undefined =
        scenarioByHost.get(execution.name);
      const generatedOperation: IGeneratedOperation | undefined =
        runtime === undefined
          ? undefined
          : generatedByAccessor.get(runtime.target);
      const operation: string | null = generatedOperation?.operation ?? null;
      const primaryInvocations: number | null =
        runtime?.primaryInvocations ?? null;
      const basename: string = path.basename(
        execution.location,
        path.extname(execution.location),
      );
      if (runtime === undefined)
        errors.push(
          `Executed test host ${execution.name} is not a registered branded scenario.`,
        );
      if (basename !== execution.name)
        errors.push(
          `Test host ${execution.name} must live in a matching ${execution.name}.ts file.`,
        );
      const exportEntries: Array<[string, unknown]> = Object.entries(
        execution.exports,
      );
      if (
        exportEntries.length !== 1 ||
        exportEntries[0]?.[0] !== execution.name ||
        exportEntries[0]?.[1] !== props.registry[execution.name]
      )
        errors.push(
          `Test file for ${execution.name} must expose exactly its registered branded host.`,
        );
      if (primaryInvocations !== null && primaryInvocations !== 1)
        errors.push(
          `Test host ${execution.name} invoked its generated primary target ${primaryInvocations} times; expected exactly once.`,
        );
      return {
        host: execution.name,
        location: execution.location,
        operation,
        primaryInvocations,
        requests: execution.requests,
      };
    });

  for (const [host] of scenarioByHost) {
    const executions: readonly ITestOperationExecution[] =
      executionByHost.get(host) ?? [];
    if (executions.length !== 1)
      errors.push(
        `Planned test host ${host} executed ${executions.length} times; expected exactly once.`,
      );
  }

  return {
    schemaVersion: 1,
    inventory,
    generated: generated
      .map((operation) => ({
        accessor: operation.name,
        operation: operation.operation,
      }))
      .sort((x, y) => x.accessor.localeCompare(y.accessor)),
    planned,
    executed,
    excluded,
    errors,
  };
};

const discoverGeneratedOperations = (root: unknown): IGeneratedOperation[] => {
  const output: IGeneratedOperation[] = [];
  const visited: Set<object> = new Set();
  const visit = (value: unknown, segments: readonly string[]): void => {
    if (
      (typeof value !== "object" || value === null) &&
      typeof value !== "function"
    )
      return;
    const object: object = value;
    if (visited.has(object)) return;
    visited.add(object);
    if (isGeneratedOperationAccessor(value)) {
      output.push({
        accessor: value,
        name: segments.join("."),
        operation: operationKey(value.METADATA.method, value.METADATA.path),
      });
      return;
    }
    for (const [key, child] of Object.entries(value))
      visit(child, [...segments, key]);
  };
  visit(root, []);
  return output;
};

const isGeneratedOperationAccessor = (
  value: unknown,
): value is IGeneratedOperationAccessor => {
  if (typeof value !== "function") return false;
  const metadata: unknown = (value as { readonly METADATA?: unknown }).METADATA;
  return (
    isRecord(metadata) &&
    typeof metadata.method === "string" &&
    typeof metadata.path === "string"
  );
};

const isHealthExecution = (execution: ITestOperationExecution): boolean =>
  execution.name === "test_api_health" &&
  execution.requests.length === 1 &&
  operationKey(execution.requests[0]!.method, execution.requests[0]!.path) ===
    "GET /health";

const operationKey = (method: string, route: string): string =>
  `${method.toUpperCase()} ${normalizeRoute(route)}`;

const normalizeRoute = (route: string): string => {
  const query: number = route.indexOf("?");
  const pathname: string = query === -1 ? route : route.slice(0, query);
  const normalized: string = pathname.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
  if (normalized.length > 1 && normalized.endsWith("/"))
    return normalized.slice(0, -1);
  return normalized;
};

const isOperationIntent = (value: string): value is TestOperationIntent =>
  (OPERATION_INTENTS as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Array.isArray(value) === false;
