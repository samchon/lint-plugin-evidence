/** Defines the fixed coding-engine matrix used by every benchmark campaign. */
export namespace EvidenceBenchmarkEngine {
  /** Stable engine identifier retained in cell state and result paths. */
  export type Name = "codex" | "claude-code";

  /** Exact provider model selected by one fixed engine definition. */
  export type Model = "gpt-5.6-terra" | "claude-sonnet-5";

  /** Explicit reasoning effort shared by the fixed campaign matrix. */
  export type Effort = "high";

  /** Exact engine, provider model, and reasoning-effort assignment. */
  export interface IDefinition {
    /** Coding-agent command surface used by the measured cell. */
    readonly engine: Name;

    /** Exact provider model passed explicitly to the engine CLI. */
    readonly model: Model;

    /** Explicit reasoning effort shared by the fixed campaign matrix. */
    readonly effort: Effort;
  }

  /** Frozen engine matrix launched for every selected subject and arm. */
  export const MATRIX: readonly IDefinition[] = Object.freeze([
    Object.freeze({
      engine: "codex",
      model: "gpt-5.6-terra",
      effort: "high",
    }),
    Object.freeze({
      engine: "claude-code",
      model: "claude-sonnet-5",
      effort: "high",
    }),
  ]);

  /** Parses one exact engine identifier without accepting display aliases. */
  export function parse(input: string): Name {
    const matched: IDefinition | undefined = MATRIX.find(
      (candidate) => candidate.engine === input,
    );
    if (matched === undefined)
      throw new Error(`Unknown benchmark engine: ${input}.`);
    return matched.engine;
  }

  /** Returns the immutable model and effort assignment for one engine. */
  export function definition(engine: Name): IDefinition {
    const matched: IDefinition | undefined = MATRIX.find(
      (candidate) => candidate.engine === engine,
    );
    if (matched === undefined)
      throw new Error(`Unknown benchmark engine: ${String(engine)}.`);
    return matched;
  }

  /** Parses an engine identifier and returns its immutable full definition. */
  export function get(input: string): IDefinition {
    return definition(parse(input));
  }
}
