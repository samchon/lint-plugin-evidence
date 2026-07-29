import { EvidenceBenchmarkCommandLine } from "../EvidenceBenchmarkCommandLine.ts";

await EvidenceBenchmarkCommandLine.main(
  process
    .getBuiltinModule("node:path")
    .resolve(import.meta.dirname, "..", "..", ".."),
  process.argv.slice(2),
);
