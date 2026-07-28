import { MyBackend } from "../src/MyBackend";
import { TestAutomation } from "./helpers/TestAutomation";

void TestAutomation.execute({
  open: async () => {
    const backend = new MyBackend();
    await backend.open();
    return backend;
  },
  close: (backend) => backend.close(),
}).then(
  (report) => {
    if (report.executions.some((execution) => execution.error !== null))
      process.exitCode = 1;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
