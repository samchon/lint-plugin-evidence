import path from "node:path";

import { writeProductSwagger } from "./TestOperationScenario";

writeProductSwagger({
  input: path.resolve(__dirname, "../../../api/swagger.json"),
  output: path.resolve(__dirname, "../../../api/swagger.product.json"),
});
