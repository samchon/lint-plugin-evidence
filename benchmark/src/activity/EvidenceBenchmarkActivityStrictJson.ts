/** Rejects duplicate keys before ordinary JSON parsing loses their identity. */
export namespace EvidenceBenchmarkActivityStrictJson {
  /** Parses one complete JSON text after a duplicate-key-aware syntax pass. */
  export function parse(input: Uint8Array | string, label: string): unknown {
    let source: string;
    try {
      source =
        typeof input === "string"
          ? input
          : new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new Error(`${label} is not valid UTF-8.`);
    }
    const cursor: Cursor = { source, offset: 0, label };
    value(cursor);
    whitespace(cursor);
    if (cursor.offset !== source.length)
      fail(cursor, "contains trailing non-whitespace data");
    return JSON.parse(source) as unknown;
  }

  interface Cursor {
    source: string;
    offset: number;
    label: string;
  }

  function value(cursor: Cursor): void {
    whitespace(cursor);
    const current: string | undefined = cursor.source[cursor.offset];
    if (current === "{") object(cursor);
    else if (current === "[") array(cursor);
    else if (current === '"') void string(cursor);
    else if (current === "t") literal(cursor, "true");
    else if (current === "f") literal(cursor, "false");
    else if (current === "n") literal(cursor, "null");
    else number(cursor);
  }

  function object(cursor: Cursor): void {
    ++cursor.offset;
    whitespace(cursor);
    if (cursor.source[cursor.offset] === "}") {
      ++cursor.offset;
      return;
    }
    const keys: Set<string> = new Set();
    for (;;) {
      whitespace(cursor);
      if (cursor.source[cursor.offset] !== '"')
        fail(cursor, "has an object key that is not a string");
      const key: string = string(cursor);
      if (keys.has(key))
        fail(cursor, `contains duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace(cursor);
      expect(cursor, ":");
      value(cursor);
      whitespace(cursor);
      const delimiter: string | undefined = cursor.source[cursor.offset];
      if (delimiter === "}") {
        ++cursor.offset;
        return;
      }
      expect(cursor, ",");
    }
  }

  function array(cursor: Cursor): void {
    ++cursor.offset;
    whitespace(cursor);
    if (cursor.source[cursor.offset] === "]") {
      ++cursor.offset;
      return;
    }
    for (;;) {
      value(cursor);
      whitespace(cursor);
      const delimiter: string | undefined = cursor.source[cursor.offset];
      if (delimiter === "]") {
        ++cursor.offset;
        return;
      }
      expect(cursor, ",");
    }
  }

  function string(cursor: Cursor): string {
    const start: number = cursor.offset;
    ++cursor.offset;
    for (;;) {
      const current: string | undefined = cursor.source[cursor.offset];
      if (current === undefined)
        fail(cursor, "contains an unterminated string");
      if (current === '"') {
        ++cursor.offset;
        return JSON.parse(cursor.source.slice(start, cursor.offset)) as string;
      }
      if (current === "\\") {
        ++cursor.offset;
        const escaped: string | undefined = cursor.source[cursor.offset];
        if (escaped === "u") {
          const digits: string = cursor.source.slice(
            cursor.offset + 1,
            cursor.offset + 5,
          );
          if (!/^[a-f0-9]{4}$/i.test(digits))
            fail(cursor, "contains an invalid Unicode escape");
          cursor.offset += 5;
          continue;
        }
        if (
          escaped === undefined ||
          !['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)
        )
          fail(cursor, "contains an invalid string escape");
        ++cursor.offset;
        continue;
      }
      if (current.charCodeAt(0) < 0x20)
        fail(cursor, "contains a control character in a string");
      ++cursor.offset;
    }
  }

  function number(cursor: Cursor): void {
    const expression: RegExp =
      /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    expression.lastIndex = cursor.offset;
    const match: RegExpExecArray | null = expression.exec(cursor.source);
    if (match === null) fail(cursor, "contains an invalid JSON value");
    cursor.offset = expression.lastIndex;
  }

  function literal(cursor: Cursor, expected: string): void {
    if (!cursor.source.startsWith(expected, cursor.offset))
      fail(cursor, `contains an invalid ${expected} literal`);
    cursor.offset += expected.length;
  }

  function expect(cursor: Cursor, expected: string): void {
    if (cursor.source[cursor.offset] !== expected)
      fail(cursor, `expected ${JSON.stringify(expected)}`);
    ++cursor.offset;
  }

  function whitespace(cursor: Cursor): void {
    while (/[\t\n\r ]/.test(cursor.source[cursor.offset] ?? ""))
      ++cursor.offset;
  }

  function fail(cursor: Cursor, message: string): never {
    throw new Error(
      `${cursor.label} ${message} at code-unit offset ${cursor.offset}.`,
    );
  }
}
