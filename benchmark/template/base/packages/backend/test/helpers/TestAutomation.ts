import api from "{{apiPackageName}}";
import { DynamicExecutor } from "@nestia/e2e";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MyConfiguration } from "../../src/MyConfiguration";
import { TEST_OPERATION_SCENARIOS } from "../OperationScenarioRegistry";
import {
  type ITestOperationRequest,
  type ITestOperationScenarioReport,
  readProductOperations,
  validateTestOperationScenarios,
} from "./TestOperationScenario";

/** Runs dynamically discovered backend feature tests against a live server. */
export namespace TestAutomation {
  /** Combined dynamic-test and product-operation coverage report. */
  export interface IReport extends DynamicExecutor.IReport {
    /** Product-operation scenario gate result. */
    operationScenarios: ITestOperationScenarioReport;
  }

  /** Backend lifecycle operations used by the dynamic test runner. */
  export interface IProps<T> {
    /** Starts the backend under test. */
    open(): Promise<T>;

    /** Stops the backend under test. */
    close(backend: T): Promise<void>;
  }

  /** Executes every exported feature test and validates product operations. */
  export async function execute<T>(props: IProps<T>): Promise<IReport> {
    const requests: Map<string, ITestOperationRequest[]> = new Map();
    const backend = await props.open();
    try {
      const report: DynamicExecutor.IReport = await DynamicExecutor.validate({
        prefix: "test",
        location: `${__dirname}/../features`,
        parameters: (name) => {
          const observed: ITestOperationRequest[] = [];
          requests.set(name, observed);
          return [
            {
              host: `http://127.0.0.1:${MyConfiguration.API_PORT()}`,
              fetch: observeFetch(globalThis.fetch, observed),
            } satisfies api.IConnection,
          ];
        },
        wrapper: async (name, closure, parameters) => {
          const original: typeof fetch = globalThis.fetch;
          const observed: ITestOperationRequest[] = requests.get(name) ?? [];
          globalThis.fetch = observeFetch(original, observed);
          try {
            return await closure(...parameters);
          } finally {
            globalThis.fetch = original;
          }
        },
        simultaneous: 1,
        extension: __filename.split(".").pop() ?? "ts",
      });
      const exportsByLocation: Map<
        string,
        Readonly<Record<string, unknown>>
      > = new Map();
      for (const location of new Set(
        report.executions.map((execution) => execution.location),
      )) {
        const modulo: object = await import(pathToFileURL(location).href);
        exportsByLocation.set(location, modulo as Record<string, unknown>);
      }
      const productSwagger: string = path.resolve(
        __dirname,
        "../../../api/swagger.product.json",
      );
      return {
        ...report,
        operationScenarios: validateTestOperationScenarios({
          inventory: readProductOperations(productSwagger),
          sdk: api.functional,
          registry: TEST_OPERATION_SCENARIOS,
          executions: report.executions.map((execution) => ({
            name: execution.name,
            location: execution.location,
            exports: exportsByLocation.get(execution.location) ?? {},
            requests: requests.get(execution.name) ?? [],
          })),
        }),
      };
    } finally {
      await props.close(backend);
    }
  }

  const observeFetch =
    (delegate: typeof fetch, requests: ITestOperationRequest[]): typeof fetch =>
    async (input, init): Promise<Response> => {
      const request: Request | null = input instanceof Request ? input : null;
      const target: string = request?.url ?? input.toString();
      requests.push({
        method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
        path: new URL(target).pathname,
      });
      return delegate(input, init);
    };
}
