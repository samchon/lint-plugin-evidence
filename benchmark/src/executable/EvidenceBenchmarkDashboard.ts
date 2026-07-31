import path from "node:path";

import { renderEvidenceBenchmarkDashboard } from "../EvidenceBenchmarkDashboard.ts";

const repository: string = path.resolve(import.meta.dirname, "../../..");
process.stdout.write(renderEvidenceBenchmarkDashboard(repository));
