import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkDurability } from "./EvidenceBenchmarkDurability.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";

/** Proves worktree bytes match exact committed Git blobs without clean filters. */
export namespace EvidenceBenchmarkOperationSource {
  /** One exact tracked source snapshot prepared before package or cell output. */
  export interface IManifest {
    /** Manifest schema version. */
    schemaVersion: 2;

    /** Versioned raw path and exact-byte aggregate algorithm. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** Exact detached source revision. */
    sourceRevision: string;

    /** Source repository used only to resolve Git objects. */
    originRepository: string;

    /** Clone-local autocrlf setting applied before checkout. */
    coreAutocrlf: "false";

    /** Clone-local EOL setting applied before checkout. */
    coreEol: "lf";

    /** Stable tracked path and byte ledger excluding `.git`. */
    files: Array<{
      /** Portable repository-relative path. */
      path: string;

      /** Exact Git tree mode; symlink payloads are hashed without dereferencing. */
      mode: string;

      /** Exact worktree byte length. */
      bytes: number;

      /** SHA-256 of exact worktree bytes. */
      sha256: string;
    }>;

    /** SHA-256 of the canonical tracked-file ledger. */
    treeSha256: string;

    /** UTC completion timestamp. */
    preparedAtUtc: string;
  }

  /**
   * Creates a detached clone whose checkout filters cannot smudge frozen bytes,
   * then proves every tracked path against its Git blob.
   */
  export async function prepare(request: {
    /** Developer repository used only as an object source. */
    repository: string;

    /** New detached checkout path. */
    output: string;

    /** Exact merged revision to check out. */
    revision: string;

    /** UTC clock. */
    now: () => Date;
  }): Promise<{ root: string; manifest: string; record: IManifest }> {
    const output: string = path.resolve(request.output);
    if (fs.existsSync(output))
      throw new Error(
        `Benchmark sealed source refuses to overwrite: ${output}.`,
      );
    await EvidenceBenchmarkProcess.run(
      "git",
      [
        "clone",
        "--quiet",
        "--no-checkout",
        "--shared",
        path.resolve(request.repository),
        output,
      ],
      { cwd: path.dirname(output), label: "benchmark sealed source clone" },
    );
    await EvidenceBenchmarkProcess.run(
      "git",
      ["config", "core.autocrlf", "false"],
      { cwd: output, label: "benchmark sealed source autocrlf" },
    );
    await EvidenceBenchmarkProcess.run("git", ["config", "core.eol", "lf"], {
      cwd: output,
      label: "benchmark sealed source eol",
    });
    await EvidenceBenchmarkProcess.run(
      "git",
      ["checkout", "--quiet", "--detach", request.revision],
      { cwd: output, label: "benchmark sealed source checkout" },
    );
    restoreExactBlobs(output);
    await assertExactWorktree(output);
    const index = await EvidenceBenchmarkProcess.run(
      "git",
      ["diff", "--cached", "--quiet", "HEAD", "--"],
      {
        cwd: output,
        label: "benchmark sealed source index",
        allowFailure: true,
      },
    );
    if (index.status !== 0)
      throw new Error(
        "Benchmark sealed source index differs from its detached revision.",
      );
    const untracked = await EvidenceBenchmarkProcess.run(
      "git",
      ["ls-files", "--others", "-z"],
      { cwd: output, label: "benchmark sealed source untracked inventory" },
    );
    if (untracked.stdout.length !== 0)
      throw new Error("Benchmark sealed source contains untracked files.");
    const files: IManifest["files"] = await trackedFiles(output);
    const record: IManifest = {
      schemaVersion: 2,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      sourceRevision: request.revision,
      originRepository: path.resolve(request.repository),
      coreAutocrlf: "false",
      coreEol: "lf",
      files,
      treeSha256: EvidenceBenchmarkHash.tree(
        new Map(
          files.map((entry) => {
            const location: string = path.join(
              output,
              ...entry.path.split("/"),
            );
            return [
              entry.path,
              entry.mode === "120000"
                ? symlinkBytes(location)
                : fs.readFileSync(location),
            ];
          }),
        ),
      ),
      preparedAtUtc: request.now().toISOString(),
    };
    const manifest: string = path.join(
      path.dirname(output),
      "sealed-source.json",
    );
    EvidenceBenchmarkDurability.writeOnce(
      manifest,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return { root: output, manifest, record };
  }

  /**
   * Rejects clean-status smudge drift such as CRLF worktree bytes over LF
   * requirement blobs.
   */
  export async function assertExactWorktree(repository: string): Promise<void> {
    const format = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "--show-object-format"],
      { cwd: repository, label: "benchmark Git object format" },
    );
    if (format.stdout.trim() !== "sha1")
      throw new Error(
        `Benchmark exact-worktree admission supports Git sha1 repositories, received ${format.stdout.trim()}.`,
      );
    const tree = await EvidenceBenchmarkProcess.run(
      "git",
      ["ls-tree", "-r", "-z", "--full-tree", "HEAD"],
      { cwd: repository, label: "benchmark exact tracked tree" },
    );
    const drifted: string[] = [];
    for (const record of tree.stdout.split("\0")) {
      if (record.length === 0) continue;
      const match: RegExpExecArray | null =
        /^([0-7]{6}) (blob) ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
      if (match === null)
        throw new Error(
          `Benchmark tracked tree contains an unsupported entry: ${record}.`,
        );
      const mode: string = match[1]!;
      const expected: string = match[3]!;
      const relative: string = match[4]!;
      const location: string = path.join(repository, ...relative.split("/"));
      if (!fs.existsSync(location)) {
        drifted.push(`${relative} (missing)`);
        continue;
      }
      const bytes: Buffer =
        mode === "120000" ? symlinkBytes(location) : fs.readFileSync(location);
      const actual: string = crypto
        .createHash("sha1")
        .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
        .update(bytes)
        .digest("hex");
      if (actual !== expected)
        drifted.push(`${relative} (${actual} != ${expected})`);
    }
    if (drifted.length !== 0)
      throw new Error(
        `Benchmark worktree bytes differ from the exact merged Git tree:\n${drifted
          .slice(0, 20)
          .map((entry) => `- ${entry}`)
          .join(
            "\n",
          )}${drifted.length > 20 ? `\n- ... ${drifted.length - 20} more` : ""}`,
      );
  }

  async function trackedFiles(repository: string): Promise<IManifest["files"]> {
    const tree = await EvidenceBenchmarkProcess.run(
      "git",
      ["ls-tree", "-r", "-z", "--full-tree", "HEAD"],
      { cwd: repository, label: "benchmark sealed source inventory" },
    );
    return tree.stdout
      .split("\0")
      .filter((record) => record.length !== 0)
      .map((record) => {
        const match: RegExpExecArray | null =
          /^([0-7]{6}) blob [0-9a-f]{40}\t([\s\S]+)$/.exec(record);
        if (match === null)
          throw new Error(
            `Benchmark sealed source contains an unsupported entry: ${record}.`,
          );
        return { mode: match[1]!, path: match[2]! };
      })
      .sort((left, right) => ordinal(left.path, right.path))
      .map((entry) => {
        const location: string = path.join(
          repository,
          ...entry.path.split("/"),
        );
        const bytes: Buffer =
          entry.mode === "120000"
            ? symlinkBytes(location)
            : fs.readFileSync(location);
        return {
          path: entry.path,
          mode: entry.mode,
          bytes: bytes.byteLength,
          sha256: EvidenceBenchmarkHash.bytes(bytes),
        };
      });
  }

  function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  /**
   * Replaces filter-smudged checkout payloads with the exact committed blobs.
   *
   * Git's `eol` attributes override clone-local `core.autocrlf=false`, so a
   * clean checkout alone is not an exact-byte source boundary.
   */
  function restoreExactBlobs(repository: string): void {
    const tree = spawnSync(
      "git",
      ["ls-tree", "-r", "-z", "--full-tree", "HEAD"],
      {
        cwd: repository,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
    );
    if (tree.error !== undefined) throw tree.error;
    if (tree.status !== 0)
      throw new Error(
        `Benchmark sealed source tree read failed: ${String(tree.stderr)}`,
      );
    for (const record of tree.stdout.split("\0")) {
      if (record.length === 0) continue;
      const match: RegExpExecArray | null =
        /^([0-7]{6}) blob ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
      if (match === null)
        throw new Error(
          `Benchmark sealed source contains an unsupported entry: ${record}.`,
        );
      const mode: string = match[1]!;
      const objectId: string = match[2]!;
      const relative: string = match[3]!;
      const blob = spawnSync("git", ["cat-file", "blob", objectId], {
        cwd: repository,
        encoding: null,
        shell: false,
        windowsHide: true,
      });
      if (blob.error !== undefined) throw blob.error;
      if (blob.status !== 0)
        throw new Error(
          `Benchmark sealed source blob read failed for ${relative}: ${blob.stderr.toString("utf8")}`,
        );
      const location: string = path.join(repository, ...relative.split("/"));
      if (mode === "120000") {
        if (fs.existsSync(location)) fs.unlinkSync(location);
        fs.symlinkSync(blob.stdout.toString("utf8"), location);
      } else {
        fs.writeFileSync(location, blob.stdout);
        if (mode === "100755") fs.chmodSync(location, 0o755);
      }
    }
  }

  function symlinkBytes(location: string): Buffer {
    if (!fs.lstatSync(location).isSymbolicLink())
      throw new Error(
        `Benchmark sealed source expected a symbolic link: ${location}.`,
      );
    return Buffer.from(fs.readlinkSync(location), "utf8");
  }
}
