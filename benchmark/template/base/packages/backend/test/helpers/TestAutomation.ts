import api from "{{apiPackageName}}";
import { DynamicExecutor } from "@nestia/e2e";

import { MyConfiguration } from "../../src/MyConfiguration";

export namespace TestAutomation {
  export interface IProps<T> {
    open(): Promise<T>;
    close(backend: T): Promise<void>;
  }

  export async function execute<T>(
    props: IProps<T>,
  ): Promise<DynamicExecutor.IReport> {
    const backend = await props.open();
    try {
      return await DynamicExecutor.validate({
        prefix: "test",
        location: `${__dirname}/../features`,
        parameters: () => [
          {
            host: `http://127.0.0.1:${MyConfiguration.API_PORT()}`,
          } satisfies api.IConnection,
        ],
        simultaneous: 1,
        extension: __filename.split(".").pop() ?? "ts",
      });
    } finally {
      await props.close(backend);
    }
  }
}
