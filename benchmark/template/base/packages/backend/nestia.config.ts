import type { INestiaConfig } from "@nestia/sdk";
import { NestFactory } from "@nestjs/core";

import { MyModule } from "./src/MyModule";

export default {
  input: () => NestFactory.create(MyModule, { logger: false }),
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
