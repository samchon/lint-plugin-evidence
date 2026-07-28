import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkOperationOrchestrator } from "./EvidenceBenchmarkOperationOrchestrator.ts";
import { EvidenceBenchmarkOperationPlan } from "./EvidenceBenchmarkOperationPlan.ts";
import { EvidenceBenchmarkOperationRegistry } from "./EvidenceBenchmarkOperationRegistry.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationAdapter } from "./structures/IEvidenceBenchmarkOperationAdapter.ts";
import type { IEvidenceBenchmarkOperationPreparer } from "./structures/IEvidenceBenchmarkOperationPreparer.ts";
import type { IEvidenceBenchmarkOperationSampler } from "./structures/IEvidenceBenchmarkOperationSampler.ts";

/** Parses and dispatches the complete benchmark operator command surface. */
export class EvidenceBenchmarkOperationCommandLine {
  /** Creates a command dispatcher from model-free and paid-gated dependencies. */
  public constructor(
    private readonly options: EvidenceBenchmarkOperationCommandLine.IOptions,
  ) {}

  /** Executes one prepare/start/status/resume/abort/grade/report invocation. */
  public async main(arguments_: readonly string[]): Promise<void> {
    const parsed: EvidenceBenchmarkOperationCommandLine.IArguments =
      this.parse(arguments_);
    if (parsed.command === "prepare") {
      const planPath: string = path.resolve(
        this.options.repository,
        this.required(parsed, "plan"),
      );
      const subjects:
        readonly ["todo", "reddit"] | readonly ["shopping", "erp"] =
        this.subjects(parsed.values.subjects);
      const replicate: number = this.positiveInteger(
        parsed.values.replicate ?? "1",
        "--replicate",
      );
      const plan: IEvidenceBenchmarkOperation.IPlan =
        await this.options.preparer.prepare({
          repository: this.options.repository,
          plan: planPath,
          blockId:
            parsed.values.block ??
            path.basename(planPath, path.extname(planPath)),
          replicate,
          subjects,
          safety: this.safety(
            path.resolve(
              this.options.repository,
              this.required(parsed, "authorization"),
            ),
          ),
          ...(parsed.values.seed === undefined
            ? {}
            : { seed: parsed.values.seed }),
        });
      this.write(plan);
      return;
    }
    if (parsed.command === "start") {
      const plan: IEvidenceBenchmarkOperation.IPlan =
        EvidenceBenchmarkOperationPlan.read(
          path.resolve(this.options.repository, this.required(parsed, "plan")),
        );
      const orchestrator: EvidenceBenchmarkOperationOrchestrator =
        await this.orchestrator(true);
      this.write(await orchestrator.start(plan));
      return;
    }
    if (parsed.command === "report") {
      const plan: IEvidenceBenchmarkOperation.IPlan =
        EvidenceBenchmarkOperationRegistry.block(
          this.options.repository,
          this.required(parsed, "block"),
        );
      const orchestrator: EvidenceBenchmarkOperationOrchestrator =
        await this.orchestrator(true);
      this.write(await orchestrator.report(plan));
      return;
    }
    const located = EvidenceBenchmarkOperationRegistry.run(
      this.options.repository,
      this.required(parsed, "run"),
    );
    if (parsed.command === "status") {
      const orchestrator: EvidenceBenchmarkOperationOrchestrator =
        await this.orchestrator(false);
      this.write(orchestrator.status(located.cell));
      return;
    }
    if (parsed.command === "abort") {
      const orchestrator: EvidenceBenchmarkOperationOrchestrator =
        await this.orchestrator(false);
      this.write(
        orchestrator.abort(located.cell, this.required(parsed, "reason")),
      );
      return;
    }
    const orchestrator: EvidenceBenchmarkOperationOrchestrator =
      await this.orchestrator(true);
    if (parsed.command === "resume")
      this.write(await orchestrator.resume(located.plan, located.cell));
    else if (parsed.command === "grade")
      this.write(await orchestrator.grade(located.plan, located.cell));
    else throw new Error(`Unsupported benchmark command: ${parsed.command}.`);
  }

  private async orchestrator(
    needsAdapter: boolean,
  ): Promise<EvidenceBenchmarkOperationOrchestrator> {
    const adapter: IEvidenceBenchmarkOperationAdapter | null = needsAdapter
      ? await this.options.loadAdapter()
      : null;
    return new EvidenceBenchmarkOperationOrchestrator({
      adapter,
      now: this.options.now,
      monotonic: this.options.monotonic,
      sampler: this.options.sampler,
    });
  }

  private parse(
    arguments_: readonly string[],
  ): EvidenceBenchmarkOperationCommandLine.IArguments {
    const commands: IEvidenceBenchmarkOperation.Command[] = [
      "prepare",
      "start",
      "status",
      "resume",
      "abort",
      "grade",
      "report",
    ];
    const command: string | undefined = arguments_[0];
    if (
      command === undefined ||
      !commands.includes(command as IEvidenceBenchmarkOperation.Command)
    )
      throw new Error(
        `Benchmark command must be one of: ${commands.join(", ")}.`,
      );
    const values: Record<string, string> = {};
    const admitted: Set<string> = new Set([
      "plan",
      "run",
      "block",
      "reason",
      "replicate",
      "seed",
      "subjects",
      "authorization",
    ]);
    for (let index: number = 1; index < arguments_.length; ++index) {
      const argument: string = arguments_[index]!;
      if (!argument.startsWith("--"))
        throw new Error(
          `Unexpected benchmark positional argument: ${argument}.`,
        );
      const equals: number = argument.indexOf("=");
      const name: string =
        equals === -1 ? argument.slice(2) : argument.slice(2, equals);
      if (!admitted.has(name))
        throw new Error(`Unknown benchmark option: --${name}.`);
      if (values[name] !== undefined)
        throw new Error(`Benchmark option --${name} cannot be repeated.`);
      const value: string | undefined =
        equals === -1 ? arguments_[++index] : argument.slice(equals + 1);
      if (value === undefined || value.startsWith("--") || value.length === 0)
        throw new Error(`Benchmark option --${name} requires a value.`);
      values[name] = value;
    }
    const allowed: Readonly<
      Record<IEvidenceBenchmarkOperation.Command, string[]>
    > = {
      prepare: [
        "plan",
        "block",
        "replicate",
        "seed",
        "subjects",
        "authorization",
      ],
      start: ["plan"],
      status: ["run"],
      resume: ["run"],
      abort: ["run", "reason"],
      grade: ["run"],
      report: ["block"],
    };
    for (const name of Object.keys(values))
      if (
        !allowed[command as IEvidenceBenchmarkOperation.Command].includes(name)
      )
        throw new Error(
          `Benchmark command ${command} does not accept --${name}.`,
        );
    return {
      command: command as IEvidenceBenchmarkOperation.Command,
      values,
    };
  }

  private required(
    parsed: EvidenceBenchmarkOperationCommandLine.IArguments,
    name: string,
  ): string {
    const value: string | undefined = parsed.values[name];
    if (value === undefined)
      throw new Error(
        `Benchmark command ${parsed.command} requires --${name}.`,
      );
    return value;
  }

  private positiveInteger(value: string, label: string): number {
    const parsed: number = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1)
      throw new Error(`${label} must be a positive integer.`);
    return parsed;
  }

  private subjects(
    value: string | undefined,
  ): readonly ["todo", "reddit"] | readonly ["shopping", "erp"] {
    if (value === undefined || value === "todo,reddit")
      return ["todo", "reddit"];
    if (value === "shopping,erp") return ["shopping", "erp"];
    throw new Error("--subjects must be exactly todo,reddit or shopping,erp.");
  }

  private safety(
    location: string,
  ): IEvidenceBenchmarkOperation.ISafetyAuthorization {
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error(
        `Benchmark safety authorization must be a JSON object: ${location}.`,
      );
    return parsed as IEvidenceBenchmarkOperation.ISafetyAuthorization;
  }

  private write(value: unknown): void {
    this.options.stdout(`${JSON.stringify(value, null, 2)}\n`);
  }
}

/** Dependencies and parsed values for the operations command dispatcher. */
export namespace EvidenceBenchmarkOperationCommandLine {
  /** Composition dependencies injected by production and deterministic tests. */
  export interface IOptions {
    /** Absolute repository root used for run and block lookup. */
    repository: string;

    /** Model-free deterministic plan preparer. */
    preparer: IEvidenceBenchmarkOperationPreparer;

    /** Fixed fail-closed production facade loader. */
    loadAdapter: () => Promise<IEvidenceBenchmarkOperationAdapter>;

    /** UTC clock. */
    now: () => Date;

    /** Monotonic nanosecond clock. */
    monotonic: () => bigint;

    /** Low-overhead diagnostic sampler. */
    sampler: IEvidenceBenchmarkOperationSampler;

    /** Standard-output sink. */
    stdout: (value: string) => void;
  }

  /** One parsed command and its non-repeated string options. */
  export interface IArguments {
    /** Exact operator command. */
    command: IEvidenceBenchmarkOperation.Command;

    /** Parsed named values without leading option markers. */
    values: Record<string, string>;
  }
}
