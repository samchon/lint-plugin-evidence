import { ExceptionManager } from "@nestia/core";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import fs from "node:fs";
import path from "node:path";

import { MyGlobal } from "./MyGlobal";
import { PrismaErrorUtil } from "./utils/PrismaErrorUtil";

export namespace MyConfiguration {
  export const API_PORT = (): number => Number(MyGlobal.env.API_PORT);

  export const ROOT = (() => {
    const split: string[] = __dirname.split(path.sep);
    return (
      split.at(-1) === "src" && split.at(-2) === "bin"
        ? path.resolve(__dirname, "../..")
        : fs.existsSync(path.resolve(__dirname, ".env"))
          ? __dirname
          : path.resolve(__dirname, "..")
    ).replaceAll("\\", "/");
  })();
}

ExceptionManager.insert(PrismaClientKnownRequestError, PrismaErrorUtil.from);
