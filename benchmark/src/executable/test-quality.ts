import { EvidenceBenchmarkQualityTest } from "../testing/EvidenceBenchmarkQualityTest.ts";

await EvidenceBenchmarkQualityTest.main(
  process
    .getBuiltinModule("node:path")
    .resolve(import.meta.dirname, "..", ".."),
);
