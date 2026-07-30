import childProcess from "node:child_process";

import { MyGlobal } from "../MyGlobal";

/** Owns destructive local database setup. */
export namespace MySetupWizard {
  /** Recreates the Prisma schema for an explicit setup process. */
  export async function schema(): Promise<void> {
    if (MyGlobal.testing === false)
      throw new Error(
        "Unable to reset the database outside an explicit setup process.",
      );
    childProcess.execSync(
      "pnpm exec prisma db push --force-reset --schema=prisma/schema",
      {
        stdio: "inherit",
      },
    );
  }
}
