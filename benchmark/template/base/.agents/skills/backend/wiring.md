# Wiring

Read [SKILL.md](SKILL.md) first. This document owns everything between "the code exists" and "the server answers": module registration, the global singleton, the bootstrap, the environment, and the generation commands.

Nothing here is optional. A controller that compiles and is not registered produces a route that does not exist, and no test you write will tell you why.

## Every Controller Reaches The Root Module

The module tree has three levels, and a controller that is not connected to all three is invisible.

A leaf module declares its controllers:

```ts
import { Module } from "@nestjs/common";
import { AdminAuthenticateController } from "./AdminAuthenticateController";

@Module({
  controllers: [AdminAuthenticateController],
})
export class AdminAuthenticateModule {}
```

An actor module imports the leaf modules under it, and the root module imports the actor modules:

```ts
import { Module } from "@nestjs/common";
import { AdminModule } from "./controllers/admins/AdminModule";
import { CustomerModule } from "./controllers/customers/CustomerModule";
import { SellerModule } from "./controllers/sellers/SellerModule";

@Module({
  imports: [AdminModule, CustomerModule, SellerModule],
})
export class MyModule {}
```

**Adding a controller is two edits, not one.** Write the controller, then register it in the module beside it, and if that module is new, import it from its parent. Forgetting the second edit is the most common way a finished endpoint turns out not to exist.

The module file sits beside the controllers it declares, named for the same group.

## The Global Singleton

One module owns the environment and the database client, and everything else reads it from there. Providers do not construct their own client.

```ts
interface IEnvironments {
  MODE: "local" | "dev" | "real";
  API_PORT: `${number}`;
  JWT_SECRET_KEY: string;
  JWT_REFRESH_KEY: string;
}

// `Singleton` defers the work until the first `get()` and caches the result,
// so the environment is read and validated once, on demand, rather than at
// import time where the order of module evaluation would decide whether the
// file had been loaded yet.
const environments = new Singleton(() => {
  const env = dotenv.config();
  dotenvExpand.expand(env);
  return typia.assert<IEnvironments>(process.env);
});

export namespace MyGlobal {
  export const prisma: PrismaClient = new PrismaClient(/* adapter */);
  export function env(): IEnvironments {
    return environments.get();
  }
}
```

Two things here are load-bearing.

**The environment is a typed interface, validated at first read.** A missing secret then fails at startup with the name of the variable, rather than at the first request that needs it, in a stack trace that names a cipher function.

**The port is typed as a numeric string**, not `string`. That is the difference between a startup failure and a server silently listening nowhere.

Declare every variable the application needs in that interface, and keep an example environment file listing them with safe defaults.

## The Bootstrap

The application class owns startup order. The executable is a bootstrap that does nothing but call it.

```ts
export class MyBackend {
  private application_?: NestFastifyApplication;

  public async open(): Promise<void> {
    // seed when the database is empty
    const count: number = await MyGlobal.prisma.channels.count();
    if (count === 0) await SetupWizard.seed();

    // mount controllers
    this.application_ = await NestFactory.create(
      MyModule,
      new FastifyAdapter(),
    );
    await this.application_.listen(Number(MyGlobal.env().API_PORT), "0.0.0.0");
  }

  public async close(): Promise<void> {
    if (this.application_ === undefined) return;
    await this.application_.close();
  }
}
```

```ts
// src/executable/server.ts
async function main(): Promise<void> {
  const backend: MyBackend = new MyBackend();
  await backend.open();
  process.on("SIGTERM", async () => {
    await backend.close();
    process.exit(0);
  });
}
main().catch((exp: unknown) => {
  console.log(exp);
  process.exit(-1);
});
```

Keep the executable to that shape. It imports one class and calls one method; parsing, orchestration, and setup live in the class.

Seeding on an empty database is what makes a fresh checkout runnable. It is not test fixture data: it is the minimum a person needs to see the product work.

## Database Errors Are Mapped At The Boundary, Once

A provider that uses the throwing finder expects a missing row to become a `404`. That does not happen by itself. Without the registration below it is a `500`, and something worse also happens.

**A Prisma error message interpolates the model, the field, the constraint, the table, the column, the offending value, and query fragments.** That message must never reach an HTTP client. Registering the mapper is what stops your schema from being readable from the outside.

```ts
// src/providers/common/PrismaErrorProvider.ts
export namespace PrismaErrorProvider {
  export function from(error: PrismaClientKnownRequestError): HttpException {
    switch (error.code) {
      case "P2025": // record not found
        return ErrorProvider.notFound("The requested resource was not found.", {
          cause: error,
        });
      case "P2002": // unique constraint
        return ErrorProvider.conflict(
          "The request conflicts with an existing resource.",
          { cause: error },
        );
      default:
        return ErrorProvider.internal("The request could not be completed.", {
          cause: error,
        });
    }
  }
}
```

```ts
// src/MyConfiguration.ts, at module scope so it runs on import
ExceptionManager.insert(
  PrismaClientKnownRequestError,
  PrismaErrorProvider.from,
);
```

Three details are load-bearing.

- **The message is replaced, not passed through.** Every branch returns a stable, application-controlled sentence.
- **The original survives as `cause`.** The framework's default response and its accessor both exclude it, so it remains available to server-side diagnostics and invisible to the client.
- **The registration is at module scope in a file the bootstrap imports**, so it is in place before the first request rather than after the first failure.

`ErrorProvider` is the shared constructor that wraps a message or a diagnosis list into an exception with a numeric status. Providers throw through it for business failures; this mapper uses it for database ones, so both arrive in the same shape.

## Generation Is Configured, Not Improvised

Two generators produce code that the rest of the repository imports, and both read a configuration file rather than command-line flags.

**Prisma** is configured in the schema's `main.prisma`: the client generator with its output path, and the documentation generator that writes the ERD.

**Nestia** is configured in `nestia.config.ts` at the backend root:

```ts
export default {
  input: () => NestFactory.create(MyModule, new FastifyAdapter()),
  output: "../api/src",
  swagger: {
    servers: [{ url: "http://localhost:37001", description: "Local" }],
    security: { bearer: { type: "apiKey", name: "Authorization", in: "header" } },
    output: "../api/swagger.json",
  },
  simulate: true,
  primitive: false,
} satisfies INestiaConfig;
```

Three settings matter beyond the paths.

- **`input` builds the real application.** The generator reads the same module tree the server runs, which is why an unregistered controller is missing from the SDK too.
- **`security`** is what puts the bearer scheme into the published document, so a consumer knows a token is needed.
- **`simulate: true`** is what gives the SDK its simulation mode, which the frontend develops against.

## Commands

```bash
pnpm --filter <backend> build:prisma   # generate the client and the ERD
pnpm --filter <backend> prepare        # push the schema to the database
pnpm --filter <backend> build:sdk      # regenerate packages/api from the controllers
pnpm --filter <backend> build:main     # compile the server
pnpm --filter <backend> start          # run it
pnpm --filter <backend> test           # run the e2e suite
```

The order is a dependency chain, not a preference. Nothing that imports the database client compiles before `build:prisma`. Nothing that imports the SDK sees a new endpoint before `build:sdk`.

## The SDK Build, End To End

This is the loop everything else depends on, and getting it wrong produces failures that look like they came from somewhere else.

**1. The schema generates the client.** `build:prisma` reads `prisma/schema/`, writes the typed client into the backend's source tree, and regenerates `docs/ERD.md` from the same comments. Every provider, transformer, and collector imports from that output, so none of them compile before it runs.

**2. `prepare` pushes the schema to the database file.** SQLite means this creates or updates a local file with nothing to install and nothing to connect to. Run it after any schema change, or the running server queries columns that do not exist.

**3. The controllers generate the SDK.** `build:sdk` builds the real application in memory, walks its module tree, and emits `packages/api/src/functional/**` and `swagger.json`. Two consequences follow directly:

- **A controller not registered in a module is absent from the SDK**, for the same reason it is absent from the running server. Both read the same tree.
- **The JSDoc on each method becomes the SDK function's documentation and the OpenAPI description.** A documentation edit is a contract change, so it needs this step too.

**4. Everything downstream consumes the regenerated SDK.** The e2e tests import their accessors from it, and the frontend imports its accessors and its types from it.

That is why an unregenerated change appears to work. The backend still compiles, the server still runs, and only a consumer notices, on the next clean build, in a package nobody was editing.

## When To Regenerate

| Change                                   | Run                            |
| ---------------------------------------- | ------------------------------ |
| a model, a column, or a schema comment   | `build:prisma`, then `prepare` |
| a controller signature, route, or method | `build:sdk`                    |
| a DTO in `packages/api/src/structures`   | `build:sdk`                    |
| JSDoc on a controller method             | `build:sdk`                    |
| a provider body only                     | nothing                        |

When in doubt, run the workspace-root `build`. It performs the whole chain in order, and it is cheaper than diagnosing a stale SDK.

## Consuming The SDK

The tests and the frontend consume the same package and the same way.

```ts
import api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const connection: api.IConnection = { host: "http://127.0.0.1:37001" };
const page: IPage<IShoppingSale.ISummary> =
  await api.functional.shoppings.customers.sales.index(connection, {
    limit: 20,
  });
```

The default export is `api`, and accessors live under `api.functional` along the route path. Types are named exports from the same package.

Authentication is not something a consumer wires up. A lifecycle accessor writes the issued token into the connection it was given, because its controller method declares `@setHeader token.access Authorization`. The caller passes the same connection object to later calls and is authenticated.

The API skill owns the full consumption contract, including simulation mode.

## The Order Of A First Run

Given only the requirement documents and an empty repository, this is the sequence that gets to a running server.

1. Read every document under `docs/analysis/`.
2. Write the schema, then `build:prisma` and `prepare`.
3. Write the DTOs, the controllers, and their modules, then `build:sdk`.
4. Write the tests from the requirements and the generated SDK.
5. Write the providers, then `build:main` and run the tests.
6. Start the server and confirm it answers.

Each step reads everything the earlier steps produced. A step that cannot proceed usually means an earlier one is incomplete, and the fix belongs there.
