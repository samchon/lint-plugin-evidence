import { EvidenceBenchmarkSelfTest } from "../EvidenceBenchmarkSelfTest.ts";

await EvidenceBenchmarkSelfTest.main(
  process
    .getBuiltinModule("node:path")
    .resolve(import.meta.dirname, "..", ".."),
  process.argv.slice(2),
);
