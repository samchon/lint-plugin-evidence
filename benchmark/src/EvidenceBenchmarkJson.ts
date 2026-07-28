/** Parses benchmark JSON while rejecting duplicate keys at every depth. */
export namespace EvidenceBenchmarkJson {
  /** Parses one complete JSON text without JavaScript's silent key overwrite. */
  export function parse(text: string, label: string): unknown {
    return new Parser(text, label).parse();
  }

  class Parser {
    private offset: number = 0;

    public constructor(
      private readonly text: string,
      private readonly label: string,
    ) {}

    public parse(): unknown {
      const value: unknown = this.value("$");
      this.whitespace();
      if (this.offset !== this.text.length)
        this.fail("unexpected trailing content");
      return value;
    }

    private value(location: string): unknown {
      this.whitespace();
      const token: string | undefined = this.text[this.offset];
      if (token === "{") return this.object(location);
      if (token === "[") return this.array(location);
      if (token === '"') return this.string();
      if (token === "t") return this.literal("true", true);
      if (token === "f") return this.literal("false", false);
      if (token === "n") return this.literal("null", null);
      return this.number();
    }

    private object(location: string): Record<string, unknown> {
      ++this.offset;
      const output: Record<string, unknown> = {};
      const keys: Set<string> = new Set();
      this.whitespace();
      if (this.text[this.offset] === "}") {
        ++this.offset;
        return output;
      }
      for (;;) {
        this.whitespace();
        if (this.text[this.offset] !== '"') this.fail("expected an object key");
        const key: string = this.string();
        if (keys.has(key))
          this.fail(
            `duplicate object key ${JSON.stringify(key)} at ${location}`,
          );
        keys.add(key);
        this.whitespace();
        if (this.text[this.offset] !== ":")
          this.fail(`expected ':' after ${JSON.stringify(key)}`);
        ++this.offset;
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: this.value(`${location}.${key}`),
        });
        this.whitespace();
        const delimiter: string | undefined = this.text[this.offset];
        if (delimiter === "}") {
          ++this.offset;
          return output;
        }
        if (delimiter !== ",") this.fail("expected ',' or '}'");
        ++this.offset;
      }
    }

    private array(location: string): unknown[] {
      ++this.offset;
      const output: unknown[] = [];
      this.whitespace();
      if (this.text[this.offset] === "]") {
        ++this.offset;
        return output;
      }
      for (;;) {
        output.push(this.value(`${location}[${output.length}]`));
        this.whitespace();
        const delimiter: string | undefined = this.text[this.offset];
        if (delimiter === "]") {
          ++this.offset;
          return output;
        }
        if (delimiter !== ",") this.fail("expected ',' or ']'");
        ++this.offset;
      }
    }

    private string(): string {
      const start: number = this.offset;
      ++this.offset;
      let escaped: boolean = false;
      while (this.offset < this.text.length) {
        const character: string = this.text[this.offset]!;
        if (!escaped && character === '"') {
          ++this.offset;
          const token: string = this.text.slice(start, this.offset);
          try {
            return JSON.parse(token) as string;
          } catch (error) {
            this.fail(
              `invalid string: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (!escaped && character.charCodeAt(0) < 0x20)
          this.fail("unescaped control character in string");
        if (!escaped && character === "\\") escaped = true;
        else escaped = false;
        ++this.offset;
      }
      this.fail("unterminated string");
    }

    private number(): number {
      const expression =
        /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
      expression.lastIndex = this.offset;
      const match: RegExpExecArray | null = expression.exec(this.text);
      if (match === null || match.index !== this.offset)
        this.fail("expected a JSON value");
      this.offset += match[0].length;
      const value: number = Number(match[0]);
      if (!Number.isFinite(value)) this.fail("number is not finite");
      return value;
    }

    private literal<T>(token: string, value: T): T {
      if (!this.text.startsWith(token, this.offset))
        this.fail(`expected ${token}`);
      this.offset += token.length;
      return value;
    }

    private whitespace(): void {
      while (
        this.offset < this.text.length &&
        [" ", "\t", "\r", "\n"].includes(this.text[this.offset]!)
      )
        ++this.offset;
    }

    private fail(reason: string): never {
      throw new Error(
        `Invalid strict JSON in ${this.label} at offset ${this.offset}: ${reason}.`,
      );
    }
  }
}
