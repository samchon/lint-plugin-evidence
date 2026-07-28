import { spawnSync } from "node:child_process";

const targets = {
  e2e: ["tests/journeys"],
  "ui-review": ["tests/ui-review.spec.ts"],
  readme: ["tests/readme.spec.ts"],
};

const mode = process.argv[2];
if (Object.hasOwn(targets, mode) === false)
  throw new Error(`Unknown Playwright mode "${mode ?? ""}".`);

const build = spawnSync("pnpm", ["build"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: "inherit",
});
if (build.status !== 0)
  throw new Error(`Frontend build failed with status ${build.status}.`);

const test = spawnSync("pnpm", ["exec", "playwright", "test", ...targets[mode]], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: "inherit",
});
if (test.status !== 0)
  throw new Error(`Playwright ${mode} failed with status ${test.status}.`);
