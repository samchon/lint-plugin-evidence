import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkInstructionPlanEntry } from "./structures/IEvidenceBenchmarkInstructionPlanEntry.ts";
import type { EvidenceBenchmarkArm } from "./typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkReviewScope } from "./typings/EvidenceBenchmarkReviewScope.ts";

/** Owns frozen and dynamically supplemented benchmark objective text. */
export namespace EvidenceBenchmarkInstruction {
  export const GOAL_OBJECTIVE_MAX_CHARACTERS = 4_000;

  /** Returns the frozen base sequence. Plain reminders are adaptive, not base. */
  export function entries(
    arm: EvidenceBenchmarkArm,
  ): readonly (readonly [string, string])[] {
    if (arm === "evidence")
      return [
        ["backend-start", "evidence/backend/start.md"],
        ["backend-review", "evidence/backend/review.md"],
        ["backend-final", "evidence/backend/final.md"],
        ["frontend-start", "evidence/frontend/start.md"],
        ["frontend-review", "evidence/frontend/review.md"],
        ["frontend-final", "evidence/frontend/final.md"],
        ["overall-review", "evidence/overall/review.md"],
        ["overall-final", "evidence/overall/final.md"],
      ];
    return [
      ["backend-start", "plain/backend/start.md"],
      ["backend-review", "plain/backend/review.md"],
      ["backend-final", "plain/backend/final.md"],
      ["frontend-start", "plain/frontend/start.md"],
      ["frontend-review", "plain/frontend/review.md"],
      ["frontend-final", "plain/frontend/final.md"],
      ["overall-review", "plain/overall/review.md"],
      ["overall-final", "plain/overall/final.md"],
    ];
  }

  /** Creates the retained base plan before any verdict inserts a supplement. */
  export function plan(
    arm: EvidenceBenchmarkArm,
  ): IEvidenceBenchmarkInstructionPlanEntry[] {
    return entries(arm).map(([name, relativePath]) => ({
      name,
      relativePath,
      kind: "base",
    }));
  }

  /** Returns the arm-owned continuation appended to every objective. */
  export function continuationPath(arm: EvidenceBenchmarkArm): string {
    return `${arm}/continue.md`;
  }

  /** Reads and validates one exact base or supplemented Goal objective. */
  export function objective(props: {
    arm: EvidenceBenchmarkArm;
    instructionsRoot: string;
    entry: Pick<
      IEvidenceBenchmarkInstructionPlanEntry,
      "relativePath" | "reviewFeedback"
    >;
  }): {
    prescribedText: string;
    continuationText: string;
    objectiveText: string;
  } {
    const prescribedText: string = readPrescribedText(props);
    const continuationText: string = fs.readFileSync(
      path.join(
        props.instructionsRoot,
        ...continuationPath(props.arm).split("/"),
      ),
      "utf8",
    );
    const objectiveText: string = `${prescribedText}\n\n${continuationText}`;
    if (objectiveText.length > GOAL_OBJECTIVE_MAX_CHARACTERS)
      throw new Error(
        `${props.entry.relativePath} expands to ${objectiveText.length} Goal characters; Codex accepts at most ${GOAL_OBJECTIVE_MAX_CHARACTERS}.`,
      );
    return { prescribedText, continuationText, objectiveText };
  }

  /** Identifies a base Review or dynamic supplementation verdict boundary. */
  export function reviewBoundary(
    entry: IEvidenceBenchmarkInstructionPlanEntry,
  ): { scope: EvidenceBenchmarkReviewScope; attempt: number } | undefined {
    if (entry.kind === "review-supplement") {
      if (
        entry.reviewScope === undefined ||
        entry.reviewAttempt === undefined ||
        entry.reviewAttempt < 1 ||
        entry.reviewAttempt > 4
      )
        throw new Error("Review supplementation plan entry is incomplete.");
      return { scope: entry.reviewScope, attempt: entry.reviewAttempt };
    }
    const match = /^(backend|frontend|overall)-review$/u.exec(entry.name);
    return match === null
      ? undefined
      : {
          scope: match[1] as EvidenceBenchmarkReviewScope,
          attempt: 0,
        };
  }

  function readPrescribedText(props: {
    arm: EvidenceBenchmarkArm;
    instructionsRoot: string;
    entry: Pick<
      IEvidenceBenchmarkInstructionPlanEntry,
      "relativePath" | "reviewFeedback"
    >;
  }): string {
    const prescribedText: string = fs.readFileSync(
      path.join(props.instructionsRoot, ...props.entry.relativePath.split("/")),
      "utf8",
    );
    if (
      !props.entry.relativePath.startsWith("plain/") ||
      !/\/(?:remind|final)\.md$/u.test(props.entry.relativePath)
    ) {
      if (props.entry.reviewFeedback !== undefined)
        throw new Error("Review feedback may extend only a Plain reminder.");
      return prescribedText;
    }
    const reviewPath: string = props.entry.relativePath.replace(
      /\/(?:remind|final)\.md$/u,
      "/review.md",
    );
    const reviewText: string = fs.readFileSync(
      path.join(props.instructionsRoot, ...reviewPath.split("/")),
      "utf8",
    );
    return [
      prescribedText.trimEnd(),
      ...(props.entry.reviewFeedback === undefined
        ? []
        : [
            `Correct these verified gaps:\n\n${props.entry.reviewFeedback.trim()}`,
          ]),
      quoteMarkdown(reviewText),
    ].join("\n\n");
  }

  function quoteMarkdown(text: string): string {
    const lines: string[] = text.split(/\r\n|\n|\r/u);
    if (lines.at(-1) === "") lines.pop();
    return lines.map((line) => `> ${line}`).join("\n");
  }
}
