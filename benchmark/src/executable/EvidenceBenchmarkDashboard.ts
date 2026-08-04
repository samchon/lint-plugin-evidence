import path from "node:path";

import { renderEvidenceBenchmarkDashboard } from "../EvidenceBenchmarkDashboard";

const repository: string = path.resolve(__dirname, "../../..");
process.stdout.write(renderEvidenceBenchmarkDashboard(repository));
