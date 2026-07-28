/** Parses the CommonMark block constructs needed by benchmark validators. */
export namespace EvidenceBenchmarkMarkdown {
  /**
   * Returns lines outside fenced code blocks without rewriting their content.
   *
   * A closing fence must use the opening character, be at least as long, and
   * contain no trailing info string. Shorter and mismatched fences stay inside
   * the code block instead of exposing headings or links to validators.
   */
  export function lines(source: string): string[] {
    const output: string[] = [];
    let fence: { character: string; length: number } | undefined;
    for (const line of source.split("\n")) {
      const marker: RegExpExecArray | null = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(
        line,
      );
      if (fence === undefined) {
        if (
          marker !== null &&
          !(marker[1]![0] === "`" && marker[2]!.includes("`"))
        ) {
          fence = {
            character: marker[1]![0]!,
            length: marker[1]!.length,
          };
          continue;
        }
        output.push(line);
      } else if (
        marker !== null &&
        marker[1]![0] === fence.character &&
        marker[1]!.length >= fence.length &&
        marker[2]!.trim().length === 0
      )
        fence = undefined;
    }
    return output;
  }
}
