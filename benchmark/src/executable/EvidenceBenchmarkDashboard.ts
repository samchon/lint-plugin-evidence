import path from "node:path";

import { renderEvidenceBenchmarkDashboard } from "../EvidenceBenchmarkDashboard";

const repository: string = path.resolve(__dirname, "../../..");
renderEvidenceBenchmarkDashboard(repository).then((text) =>
  process.stdout.write(text),
);
