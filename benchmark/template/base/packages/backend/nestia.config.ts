import type { INestiaConfig } from "@nestia/sdk";

import { MyModule } from "./src/MyModule";

export default {
  input: MyModule.input(),
  output: "../api/src",
  swagger: {
    output: "../api/swagger.json",
    beautify: true,
    security: {
      bearer: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
  simulate: true,
} satisfies INestiaConfig;
