import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { Singleton } from "tstl";
import typia, { tags } from "typia";

import { MyConfiguration } from "./MyConfiguration";
import { PrismaClient } from "./prisma/client";

export class MyGlobal {
  public static get env(): MyGlobal.IEnvironments {
    return environments.get();
  }

  public static get prisma(): PrismaClient {
    return prisma.get();
  }
}

export namespace MyGlobal {
  export interface IEnvironments {
    API_PORT: `${number}`;
    JWT_SECRET_KEY: string & tags.MinLength<32>;
    JWT_ACCESS_TTL_SECONDS: string & tags.Pattern<"^[1-9][0-9]*$">;
    JWT_REFRESH_TTL_SECONDS: string & tags.Pattern<"^[1-9][0-9]*$">;
  }
}

const environments = new Singleton(() => {
  const loaded = dotenv.config();
  dotenvExpand.expand(loaded);
  const validated = typia.assert<MyGlobal.IEnvironments>(
    process.env,
    (props) =>
      new Error(
        `Invalid environment ${props.path}: expected ${props.expected}.`,
      ),
  );
  if (
    BigInt(validated.JWT_REFRESH_TTL_SECONDS) <=
    BigInt(validated.JWT_ACCESS_TTL_SECONDS)
  )
    throw new Error(
      "Invalid environment: JWT_REFRESH_TTL_SECONDS must exceed JWT_ACCESS_TTL_SECONDS.",
    );
  return validated;
});

const prisma = new Singleton(
  () =>
    new PrismaClient({
      adapter: new PrismaBetterSqlite3({
        url: `${MyConfiguration.ROOT}/prisma/db.sqlite`,
      }),
    }),
);
