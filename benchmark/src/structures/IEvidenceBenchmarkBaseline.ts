/** One successful neutral-scaffold admission for a template revision. */
export interface IEvidenceBenchmarkBaseline {
  /** Published gate root containing the runnable workspace, logs, and record. */
  root: string;

  /** Rendered neutral workspace used by every admission command. */
  workspace: string;

  /** SHA-256 identity of the normalized base template source tree. */
  baseTreeSha256: string;

  /** SHA-256 identity of the rendered neutral workspace before installation. */
  renderedTreeSha256: string;

  /** SHA-256 identity of the frozen dependency lock. */
  lockSha256: string;

  /** Exact pnpm release that executed every admission step. */
  pnpmVersion: "10.10.0";

  /** UTC timestamp recorded after every neutral admission step passed. */
  completedAt: string;

  /** Timings and retained process logs separated from measured agent work. */
  steps: Readonly<
    Record<IEvidenceBenchmarkBaseline.Step, IEvidenceBenchmarkBaseline.IStep>
  >;
}

/** Neutral admission requests, step identities, and retained step records. */
export namespace IEvidenceBenchmarkBaseline {
  /** Ordered neutral steps that never include an arm plugin or coding agent. */
  export type Step =
    | "pnpm-version"
    | "lock"
    | "install"
    | "format"
    | "build"
    | "database"
    | "backend-test"
    | "browser-install"
    | "frontend-test";

  /** One completed setup command and its separately retained logs. */
  export interface IStep {
    /** Monotonic wall-clock milliseconds from spawn through process close. */
    elapsedMs: number;

    /** Gate-root-relative path of the exact captured standard-output log. */
    stdout: string;

    /** Gate-root-relative path of the exact captured standard-error log. */
    stderr: string;
  }

  /** Inputs selecting one repository snapshot and new admission output root. */
  export interface IRequest {
    /** Repository root containing the complete benchmark base and arm trees. */
    repository: string;

    /** New output root atomically published on pass or diagnostic failure. */
    output: string;
  }
}
