import { EvidenceBenchmarkSourceContract } from "../EvidenceBenchmarkSourceContract.ts";

EvidenceBenchmarkSourceContract.main(
  process.getBuiltinModule("node:path").resolve(import.meta.dirname, ".."),
);
