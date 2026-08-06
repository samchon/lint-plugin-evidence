import fs from "node:fs";
import path from "node:path";

import {
  applyDirectStage,
  applySessionTokens,
  baseSubject,
  collectEvidenceBenchmarkReport,
  PUBLISHED,
} from "./EvidenceBenchmarkDashboard";
import { EvidenceBenchmarkDirectStage } from "./EvidenceBenchmarkDirectStage";
import { EvidenceBenchmarkInstruction } from "./EvidenceBenchmarkInstruction";
import { EvidenceBenchmarkSessionCost } from "./EvidenceBenchmarkSessionCost";
import type {
  IEvidenceBenchmarkReport,
  IEvidenceBenchmarkReportCell,
} from "./structures/IEvidenceBenchmarkReport";

export interface IEvidenceBenchmarkReportOptions {
  repository: string;
  output: string;
  generatedAt?: Date;
  runIds?: readonly string[];
}

/**
 * Writes the latest-run JSON aggregate, stable cells, and comparison charts.
 *
 * Prices are collected the way the dashboard collects them: the runner's
 * retained request stream where it can answer, the cell's own Codex session
 * where it cannot. Insisting on the replay alone stopped this report from
 * regenerating at all once the campaign started driving cells by hand, which
 * is how its charts came to be three days older than the run they describe.
 */
export const writeEvidenceBenchmarkReport = async (
  options: IEvidenceBenchmarkReportOptions,
): Promise<IEvidenceBenchmarkReport> => {
  const collected: IEvidenceBenchmarkReport = collectEvidenceBenchmarkReport(
    options.repository,
    options.generatedAt,
    options.runIds,
    true,
    false,
  );
  const sessions: ReadonlyMap<
    string,
    EvidenceBenchmarkSessionCost.ISessionTotals
  > = await EvidenceBenchmarkSessionCost.totals(
    collected.cells[0]?.model ?? "gpt-5.6-luna",
  );
  // The same correction the dashboard applies: a cell driven past the runner's
  // last record still reads `completed` in `state.json`, and a chart that
  // believed that would draw Erp Plain as a finished result while four of its
  // stages were being re-run.
  const dispatches: ReadonlyMap<
    string,
    EvidenceBenchmarkDirectStage.IDirectStage
  > = await EvidenceBenchmarkDirectStage.collect(
    path.join(options.repository, "benchmark", "instructions"),
  );
  const report: IEvidenceBenchmarkReport = {
    ...collected,
    cells: collected.cells
      .map((cell) =>
        cell.apiCost !== null
          ? cell
          : { ...cell, apiCost: sessions.get(cell.runId)?.cost ?? null },
      )
      .map((cell) =>
        applyDirectStage(cell, options.repository, dispatches.get(cell.runId)),
      )
      .map((cell) => applySessionTokens(cell, sessions.get(cell.runId))),
  };
  // The charts show one cell per arm per subject, the same eight the dashboard
  // publishes. Five Evidence cells were re-run and the runs that lost are not
  // a second subject: charting `reddit2` beside `reddit` drew a comparison
  // nobody made, and a repeat's figures belong to the subject it repeats.
  const published: IEvidenceBenchmarkReportCell[] = report.cells
    .filter((cell) => PUBLISHED.has(`${cell.subject}/${cell.arm}`))
    .map((cell) => ({ ...cell, subject: baseSubject(cell.subject) }));
  // A subject is charted once both its arms have finished. A bar for a cell
  // still working reads as its result, and it is not one: half its stages have
  // not run, so it would show the arm ahead on every spend axis for no reason
  // except that it stopped earlier. Subjects arrive in the charts as they
  // complete rather than being drawn in advance.
  const finished: ReadonlySet<string> = new Set(
    [...Map.groupBy(published, (cell) => cell.subject)]
      .filter(
        ([, cells]) =>
          cells.length >= 2 &&
          cells.every((cell) => cell.status === "completed"),
      )
      .map(([subject]) => subject),
  );
  const charted: IEvidenceBenchmarkReportCell[] = published.filter((cell) =>
    finished.has(cell.subject),
  );
  const chartReport: IEvidenceBenchmarkReport = {
    ...report,
    cells: charted,
  };
  const output: string = path.resolve(options.output);
  fs.mkdirSync(output, { recursive: true });
  for (const entry of fs.readdirSync(output, { withFileTypes: true }))
    if (entry.isFile() && /\.(?:png|svg)$/u.test(entry.name))
      fs.rmSync(path.join(output, entry.name));
  fs.writeFileSync(
    path.join(output, "summary.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const cells: string = path.join(output, "cells");
  fs.rmSync(cells, { recursive: true, force: true });
  for (const cell of report.cells) {
    const file: string = path.join(
      cells,
      pathSegment(cell.model),
      pathSegment(cell.subject),
      `${cell.arm}.json`,
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(cell, null, 2)}\n`);
  }
  // A subject's chart belongs beside the JSON holding the same run's figures,
  // so opening a subject's directory gives its numbers and its picture at once.
  for (const [model, subjects] of Map.groupBy(charted, (cell) => cell.model))
    for (const subject of new Set(subjects.map((cell) => cell.subject)))
      fs.writeFileSync(
        path.join(cells, pathSegment(model), pathSegment(subject), "arms.svg"),
        renderSubjectChart(chartReport, subject),
      );
  // One chart rather than three. Work time and price moved to text beside the
  // token bar they track, and coverage — the axis the other two cannot stand in
  // for — took the space they left.
  fs.rmSync(path.join(output, "tokens.svg"), { force: true });
  fs.rmSync(path.join(output, "time.svg"), { force: true });
  fs.writeFileSync(path.join(output, "summary.svg"), renderSummaryChart(chartReport));
  return report;
};

const pathSegment = (value: string): string => {
  const encoded: string = encodeURIComponent(value);
  return encoded === "." || encoded === ".."
    ? encoded.replaceAll(".", "%2E")
    : encoded;
};

type PhaseName =
  | "backend-development"
  | "backend-review"
  | "frontend-development"
  | "frontend-review"
  | "overall-review";

const API_PRICE_NOTE =
  "API cost uses OpenRouter rates from 2026-08-01 and is emitted only after every measured request reconciles with retained counters. Review inspection runs on the cell's own model and effort, so its tokens, time, and price all sit inside these totals.";

const PHASES: readonly {
  name: PhaseName;
  label: string;
  short: string;
}[] = [
  {
    name: "backend-development",
    label: "Backend Dev",
    short: "BE Dev",
  },
  { name: "backend-review", label: "Backend Review", short: "BE Rev" },
  {
    name: "frontend-development",
    label: "Frontend Dev",
    short: "FE Dev",
  },
  { name: "frontend-review", label: "Frontend Review", short: "FE Rev" },
  { name: "overall-review", label: "Overall Review", short: "Overall" },
];

const PHASE_OPACITY: readonly number[] = [0.44, 0.58, 0.7, 0.84, 1];

interface IPhaseMetric {
  title: string;
  description: string;
  subtitle: string;
  tableTitle: string;
  tableColumns: readonly { label: string; x: number }[];
  tableValues: (
    cell: IEvidenceBenchmarkReportCell,
    phases: readonly IPhaseValue[],
  ) => readonly string[];
  tableNotes: readonly string[];
  dataAttribute: string;
  cellValue: (cell: IEvidenceBenchmarkReportCell) => number;
  stageValue: (stage: IEvidenceBenchmarkReportCell["stages"][number]) => number;
  format: (value: number) => string;
}

interface IPhaseValue {
  name: PhaseName;
  short: string;
  value: number;
}

const TOKEN_TABLE_COLUMNS: IPhaseMetric["tableColumns"] = [
  { label: "Project", x: 60 },
  { label: "Arm", x: 150 },
  { label: "API cost", x: 325 },
  { label: "Total", x: 475 },
  { label: "Input", x: 625 },
  { label: "Cached input", x: 790 },
  { label: "Cache write", x: 960 },
  { label: "Output", x: 1_120 },
  { label: "Reasoning", x: 1_395 },
];

/** One stylesheet for every chart this module writes. */
const CHART_STYLE ="<style>\n  text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #172033; }\n  .title { font-size: 27px; font-weight: 700; }\n  .subtitle, .generated, .group-meta, .row-status { font-size: 13px; fill: #667085; }\n  .group { fill: #e8f2fb; }\n  .group-title { font-size: 21px; font-weight: 700; }\n  .row-label { font-size: 17px; font-weight: 700; }\n  .value { font-size: 16px; font-weight: 700; }\n  .cost-value { font-size: 13px; font-weight: 600; fill: #526b82; }\n  .legend { font-size: 12px; fill: #526b82; }\n  .segment-label { font-size: 10px; font-weight: 700; fill: #ffffff; paint-order: stroke; stroke: #172033; stroke-opacity: 0.28; stroke-width: 1px; }\n  .phase-segment { stroke: #ffffff; stroke-opacity: 0.86; stroke-width: 1px; }\n  .track { fill: #e7edf4; stroke: #d5dee9; stroke-width: 1px; }\n  .empty { font-size: 15px; fill: #667085; }\n  .table-title { font-size: 15px; font-weight: 600; }\n  .table-header { font-size: 11px; font-weight: 600; fill: #667085; }\n  .table-cell { font-size: 12px; fill: #334155; }\n  .table-rule { stroke: #dbe4ee; stroke-width: 1px; }\n  .table-note { font-size: 11px; fill: #667085; }\n</style>";

/**
 * What share of the provenance graph each Plain subject satisfied.
 *
 * These are read from the source by hand rather than emitted by a run, so they
 * live here as data rather than arriving on the report. Thirteen edges are
 * measured per subject and composed so serial hops multiply and branches
 * average; a subject absent from this map has not been measured yet, and its
 * bar is omitted rather than drawn at zero.
 *
 * Evidence carries no entry because it is not measured: a cell that misses an
 * edge does not compile, so the arm is 100% by construction.
 */
const COVERAGE: Readonly<Record<string, number>> = {
  todo: 80.1,
  reddit: 62.4,
};

const COVERAGE_NOTE =
  "Coverage measured by Claude Code Opus 5 — thirteen graph edges read from the source, composed so serial hops multiply and branches average. Evidence is 100% by construction: a cell that misses an edge does not compile." as const;

const renderSummaryChart = (report: IEvidenceBenchmarkReport): string =>
  renderPhaseChart(report, {
    title: "Benchmark: Plain against Evidence",
    description:
      "Coverage of the provenance graph per subject, then token spend per subject with stacked shades for backend development and review, frontend development and review, and overall review. Work time and API cost read beside each bar.",
    subtitle:
      "Coverage is higher-is-better. Token spend is lower-is-better and shares one axis across subjects; stacked shades show development and review phases, and work time and cost sit beside each bar.",
    tableTitle: "Token counter details",
    tableColumns: TOKEN_TABLE_COLUMNS,
    tableValues: (cell) => [
      title(cell.subject),
      title(cell.arm),
      formatApiCost(cell),
      formatInteger(cell.tokenUsage.totalTokens),
      formatInteger(cell.tokenUsage.inputTokens),
      formatInteger(cell.tokenUsage.cachedInputTokens),
      formatInteger(cell.tokenUsage.cacheWriteInputTokens),
      formatInteger(cell.tokenUsage.outputTokens),
      formatInteger(cell.tokenUsage.reasoningOutputTokens),
    ],
    tableNotes: [
      "Native Codex counters: Cached input is included in Input; Reasoning is included in Output.",
      API_PRICE_NOTE,
    ],
    dataAttribute: "tokens",
    cellValue: (cell) => cell.tokens,
    stageValue: (stage) => stage.tokens,
    format: formatTokens,
  });

/**
 * One subject's two arms across every measured axis.
 *
 * Coverage carries no phases because it is a property of the artifact rather
 * than of the work that made it. The three spend axes carry the same stacked
 * shades, so a reader comparing them sees which phase moved rather than only
 * that a total did.
 *
 * Cost has no per-phase counter of its own. Its segments are the cell's price
 * apportioned by each phase's token share, which is exact wherever every
 * request was billed at one rate and an apportionment otherwise; the footnote
 * says so rather than letting the bar imply a measurement.
 */
const renderSubjectChart = (
  report: IEvidenceBenchmarkReport,
  subject: string,
): string => {
  const width: number = 1_440;
  const margin: number = 36;
  const labelX: number = 60;
  const barX: number = 210;
  // The track runs to where the value text begins rather than stopping at a
  // round number, because a bar that ends 300px short of the canvas reads as a
  // bar that fell short. Only the widest label needs to clear it.
  const barMaximumWidth: number = width - margin - barX - 200;
  const valueX: number = width - margin;
  const rowHeight: number = 68;
  const cells: IEvidenceBenchmarkReportCell[] = report.cells
    .filter((cell) => cell.subject === subject)
    .sort((left, right) => armOrder(left.arm) - armOrder(right.arm));
  const models: string = [
    ...new Set(cells.map((cell) => displayModel(cell.model))),
  ].join(", ");
  const axes: {
    label: string;
    hint: string;
    value: (cell: IEvidenceBenchmarkReportCell) => number;
    phase: (
      cell: IEvidenceBenchmarkReportCell,
    ) => readonly IPhaseValue[];
    format: (value: number) => string;
  }[] = [
    {
      label: "Tokens",
      hint: "lower is better",
      value: (cell) => cell.tokens,
      phase: (cell) => phaseValues(cell, (stage) => stage.tokens),
      format: formatTokens,
    },
    {
      label: "Work time",
      hint: "lower is better",
      value: (cell) => cell.workElapsedMs,
      phase: (cell) => phaseValues(cell, (stage) => stage.elapsedMs),
      format: formatDuration,
    },
    {
      label: "API cost",
      hint: "lower is better · apportioned by token share",
      value: (cell) => cell.apiCost?.amountUsd ?? 0,
      phase: (cell) => {
        const price: number = cell.apiCost?.amountUsd ?? 0;
        const total: number = Math.max(1, cell.tokens);
        return phaseValues(cell, (stage) => stage.tokens).map((phase) => ({
          ...phase,
          value: (phase.value / total) * price,
        }));
      },
      format: (value) => `$${formatPrice(value)}`,
    },
  ];
  const header: number = 124;
  const blockHeight: number = 44 + Math.max(1, cells.length) * rowHeight + 14;
  const coverage = renderCoverage(
    { ...report, cells },
    {
      title: "Coverage",
      top: header,
      margin,
      width,
      labelX,
      barX,
      barMaximumWidth,
      valueX,
      rowHeight: 40,
    },
  );
  const coverageHeight: number =
    coverage.height === 0 ? 0 : coverage.height + 36;
  const height: number =
    header + coverageHeight + axes.length * (blockHeight + 16) + 62;
  const body: string[] = [
    ...coverage.body,
    ...(coverage.height === 0
      ? []
      : [
          `<text x="${margin}" y="${header + coverage.height + 18}" class="table-note">${escapeXml(COVERAGE_NOTE)}</text>`,
        ]),
  ];
  let cursor: number = header + coverageHeight;
  axes.forEach((axis, axisIndex) => {
    // A stage record can sum to more than the cell total it belongs to — the
    // total excludes idleness the records keep — so scaling by the total alone
    // let a bar run past its own track and off the canvas.
    const maximum: number = Math.max(
      1,
      ...cells.map((cell) =>
        Math.max(
          axis.value(cell),
          axis.phase(cell).reduce((sum, phase) => sum + phase.value, 0),
        ),
      ),
    );
    body.push(
      `<rect x="${margin - 8}" y="${cursor}" width="${width - 2 * margin + 16}" height="${blockHeight}" rx="10" class="group" fill-opacity="${axisIndex % 2 === 0 ? "0.78" : "0.42"}"/>`,
      `<text x="${labelX}" y="${cursor + 29}" class="group-title">${escapeXml(axis.label)}</text>`,
      `<text x="${valueX}" y="${cursor + 28}" text-anchor="end" class="group-meta">${escapeXml(axis.hint)}</text>`,
    );
    cells.forEach((cell, index) => {
      const y: number = cursor + 44 + index * rowHeight;
      body.push(
        `<text x="${labelX}" y="${y + 21}" class="row-label" fill="${armColor(cell.arm)}">${escapeXml(title(cell.arm))}</text>`,
        `<text x="${labelX}" y="${y + 44}" class="row-status">${escapeXml(cell.status)}</text>`,
        `<rect x="${barX}" y="${y + 3}" width="${barMaximumWidth}" height="36" rx="7" class="track"/>`,
      );
      let offset: number = 0;
      axis.phase(cell).forEach((phase, phaseIndex) => {
        const segmentWidth: number = (phase.value / maximum) * barMaximumWidth;
        if (segmentWidth <= 0) return;
        body.push(
          `<rect x="${(barX + offset).toFixed(2)}" y="${y + 3}" width="${segmentWidth.toFixed(2)}" height="36" fill="${armColor(cell.arm)}" fill-opacity="${PHASE_OPACITY[phaseIndex] ?? PHASE_OPACITY.at(-1)!}" class="phase-segment" data-phase="${phase.name}"/>`,
        );
        if (segmentWidth >= phase.short.length * 6.5 + 12)
          body.push(
            `<text x="${(barX + offset + segmentWidth / 2).toFixed(2)}" y="${y + 27}" text-anchor="middle" class="segment-label">${escapeXml(phase.short)}</text>`,
          );
        offset += segmentWidth;
      });
      const baseline: IEvidenceBenchmarkReportCell | undefined = cells.find(
        (candidate) => candidate.arm === "plain",
      );
      const delta: string =
        baseline === undefined ||
        cell.arm === "plain" ||
        axis.value(baseline) === 0
          ? ""
          : ` (${Math.round((axis.value(cell) / axis.value(baseline) - 1) * 100)}%)`;
      body.push(
        `<text x="${valueX}" y="${y + 26}" text-anchor="end" class="value">${escapeXml(`${axis.format(axis.value(cell))}${delta}`)}</text>`,
      );
    });
    cursor += blockHeight + 16;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title id="title">${escapeXml(title(subject))}: Plain against Evidence</title>`,
    `<desc id="description">Coverage of the provenance graph, then token spend, work time and API cost. Every spend axis carries the same stacked phase shades.</desc>`,
    CHART_STYLE,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margin}" y="38" class="title">${escapeXml(title(subject))}: Plain against Evidence</text>`,
    `<text x="${margin}" y="62" class="subtitle">One subject, one instruction sequence, ${escapeXml(models)}. The Evidence arm adds a compiler-enforced provenance graph.</text>`,
    ...phaseLegend(margin),
    ...body,
    `<text x="${margin}" y="${height - 32}" class="table-note">${escapeXml(API_PRICE_NOTE)}</text>`,
    `<text x="${margin}" y="${height - 14}" class="generated">Generated ${escapeXml(report.generatedAt)}</text>`,
    "</svg>",
    "",
  ].join("\n");
};

/** The shared phase legend, drawn under every chart's subtitle. */
const phaseLegend = (margin: number): string[] => {
  const legend: string[] = [];
  let legendX: number = margin;
  PHASES.forEach((phase, index) => {
    legend.push(
      `<rect x="${legendX}" y="82" width="18" height="12" rx="3" fill="${armColor("plain")}" fill-opacity="${PHASE_OPACITY[index]}"/>`,
      `<text x="${legendX + 25}" y="93" class="legend">${escapeXml(phase.label)}</text>`,
    );
    legendX += 250;
  });
  legend.push(
    `<rect x="${legendX}" y="82" width="18" height="12" rx="3" fill="#94a3b8"/>`,
    `<text x="${legendX + 25}" y="93" class="legend">Review inspection</text>`,
  );
  return legend;
};

const renderCoverage = (
  report: IEvidenceBenchmarkReport,
  props: {
    top: number;
    margin: number;
    width: number;
    labelX: number;
    barX: number;
    barMaximumWidth: number;
    valueX: number;
    rowHeight: number;
    title: string;
  },
): { body: string[]; height: number } => {
  // Ordered by subject size, the order every other view uses, rather than
  // alphabetically — which put Reddit before Todo and broke the one reading the
  // chart exists to support, that coverage falls as the subject grows.
  const subjects: string[] = [
    ...new Set(report.cells.map((cell) => cell.subject)),
  ]
    .filter((subject) => COVERAGE[subject] !== undefined)
    .sort((left, right) => subjectRank(left) - subjectRank(right));
  if (subjects.length === 0) return { body: [], height: 0 };
  const rows: { label: string; percent: number; arm: "plain" | "evidence" }[] = [
    ...subjects.map((subject) => ({
      label: `${title(subject)} Plain`,
      percent: COVERAGE[subject]!,
      arm: "plain" as const,
    })),
    { label: "Evidence (every)", percent: 100, arm: "evidence" as const },
  ];
  const height: number = 52 + rows.length * props.rowHeight + 14;
  const body: string[] = [
    `<rect x="${props.margin - 8}" y="${props.top}" width="${props.width - 2 * props.margin + 16}" height="${height}" rx="10" class="group" fill-opacity="0.78"/>`,
    `<text x="${props.labelX}" y="${props.top + 31}" class="group-title">${escapeXml(props.title)}</text>`,
    `<text x="${props.valueX}" y="${props.top + 30}" text-anchor="end" class="group-meta">higher is better</text>`,
  ];
  // Bars here reach 100% of their track, so a value pinned to the right margin
  // sits on top of the bar it labels. Each reads just past its own end instead,
  // which also puts the number where the eye already is.
  rows.forEach((row, index) => {
    const y: number = props.top + 52 + index * props.rowHeight;
    const filled: number = (row.percent / 100) * props.barMaximumWidth;
    body.push(
      `<text x="${props.labelX}" y="${y + 24}" class="row-label" fill="${armColor(row.arm)}">${escapeXml(row.label)}</text>`,
      `<rect x="${props.barX}" y="${y + 3}" width="${props.barMaximumWidth}" height="30" rx="7" class="track"/>`,
      `<rect x="${props.barX}" y="${y + 3}" width="${filled.toFixed(2)}" height="30" rx="7" fill="${armColor(row.arm)}" data-coverage="${row.percent}"/>`,
      `<text x="${props.valueX}" y="${y + 25}" text-anchor="end" class="value" fill="${armColor(row.arm)}">${row.percent.toFixed(1)}%</text>`,
    );
  });
  return { body, height };
};

const renderPhaseChart = (
  report: IEvidenceBenchmarkReport,
  metric: IPhaseMetric,
): string => {
  const width: number = 1_440;
  const margin: number = 36;
  const headerHeight: number = 124;
  const footerHeight: number = 36;
  const groupGap: number = 16;
  const groupHeaderHeight: number = 44;
  const rowHeight: number = 68;
  const groupPaddingBottom: number = 14;
  const notesHeight: number = metric.tableNotes.length * 15 + 30;
  const labelX: number = 60;
  const barX: number = 210;
  // The track runs to where the value text begins rather than stopping at a
  // round number, because a bar that ends 300px short of the canvas reads as a
  // bar that fell short. Only the widest label needs to clear it.
  const barMaximumWidth: number = width - margin - barX - 200;
  const valueX: number = width - margin;
  const groups: [string, IEvidenceBenchmarkReportCell[]][] = [
    ...Map.groupBy(report.cells, (cell) => cell.subject),
  ];
  const groupHeight = (
    cells: readonly IEvidenceBenchmarkReportCell[],
  ): number =>
    groupHeaderHeight +
    Math.max(1, cells.length) * rowHeight +
    groupPaddingBottom;
  const groupContentHeight: number = Math.max(
    64,
    groups.reduce(
      (sum, [, cells]) => sum + groupHeight(cells) + groupGap,
      -groupGap,
    ),
  );
  const coverage = renderCoverage(report, {
    title: "Requirement Coverage",
    top: headerHeight,
    margin,
    width,
    labelX,
    barX,
    barMaximumWidth,
    valueX,
    rowHeight: 40,
  });
  const coverageHeight: number =
    coverage.height === 0 ? 0 : coverage.height + groupGap + 20;
  const height: number =
    headerHeight +
    coverageHeight +
    groupContentHeight +
    notesHeight +
    footerHeight;
  const maximum: number = Math.max(
    1,
    ...report.cells.map((cell) =>
      Math.max(
        metric.cellValue(cell),
        phaseValues(cell, metric.stageValue).reduce(
          (sum, phase) => sum + phase.value,
          0,
        ),
      ),
    ),
  );
  let cursor: number = headerHeight + coverageHeight;
  const body: string[] = [
    ...coverage.body,
    ...(coverage.height === 0
      ? []
      : [
          `<text x="${margin}" y="${headerHeight + coverage.height + 18}" class="table-note">${escapeXml(COVERAGE_NOTE)}</text>`,
        ]),
  ];
  groups.forEach(([subject, unsorted], groupIndex) => {
    const cells: IEvidenceBenchmarkReportCell[] = [...unsorted].sort(
      (left, right) =>
        armOrder(left.arm) - armOrder(right.arm) ||
        left.model.localeCompare(right.model),
    );
    const blockHeight: number = groupHeight(cells);
    const models: string = [
      ...new Set(cells.map((cell) => displayModel(cell.model))),
    ].join(", ");
    body.push(
      `<rect x="${margin - 8}" y="${cursor}" width="${width - 2 * margin + 16}" height="${blockHeight}" rx="10" class="group" fill-opacity="${groupIndex % 2 === 0 ? "0.78" : "0.42"}"/>`,
      `<text x="${labelX}" y="${cursor + 29}" class="group-title">${escapeXml(title(subject))}</text>`,
      `<text x="${valueX}" y="${cursor + 28}" text-anchor="end" class="group-meta">${escapeXml(models)}</text>`,
    );
    cells.forEach((cell, index) => {
      const y: number = cursor + groupHeaderHeight + index * rowHeight;
      const baseline: IEvidenceBenchmarkReportCell | undefined = cells.find(
        (candidate) =>
          candidate.arm === "plain" && candidate.model === cell.model,
      );
      const label: string = phaseValueLabel(cell, baseline, metric);
      const cost: string = formatApiCostLine(cell);
      body.push(
        `<text x="${labelX}" y="${y + 21}" class="row-label" fill="${armColor(cell.arm)}">${escapeXml(title(cell.arm))}</text>`,
        `<text x="${labelX}" y="${y + 44}" class="row-status">${escapeXml(cell.status)}</text>`,
        `<rect x="${barX}" y="${y + 3}" width="${barMaximumWidth}" height="36" rx="7" class="track"/>`,
      );
      let offset: number = 0;
      const phases = phaseValues(cell, metric.stageValue);
      phases.forEach((phase, phaseIndex) => {
        const segmentWidth: number = (phase.value / maximum) * barMaximumWidth;
        if (segmentWidth <= 0) return;
        const opacity: number =
          PHASE_OPACITY[phaseIndex] ?? PHASE_OPACITY.at(-1)!;
        body.push(
          `<rect x="${(barX + offset).toFixed(2)}" y="${y + 3}" width="${segmentWidth.toFixed(2)}" height="36" fill="${armColor(cell.arm)}" fill-opacity="${opacity}" class="phase-segment" data-phase="${phase.name}" data-${metric.dataAttribute}="${phase.value}"/>`,
        );
        if (segmentWidth >= phase.short.length * 6.5 + 12)
          body.push(
            `<text x="${(barX + offset + segmentWidth / 2).toFixed(2)}" y="${y + 27}" text-anchor="middle" class="segment-label">${escapeXml(phase.short)}</text>`,
          );
        offset += segmentWidth;
      });
      // Judging a cell's Reviews belongs to no stage, so the phases summed to
      // less than the total the same row's label reported and the widest bar
      // stopped short of its own scale. It gets a segment of its own.
      const judged: number =
        metric.cellValue(cell) -
        phases.reduce((sum, phase) => sum + phase.value, 0);
      const judgedWidth: number = (judged / maximum) * barMaximumWidth;
      if (judgedWidth > 0.5)
        body.push(
          `<rect x="${(barX + offset).toFixed(2)}" y="${y + 3}" width="${judgedWidth.toFixed(2)}" height="36" fill="#94a3b8" class="phase-segment" data-phase="review-inspection" data-${metric.dataAttribute}="${judged}"/>`,
        );
      body.push(
        `<text x="${valueX}" y="${y + 19}" text-anchor="end" class="value">${escapeXml(label)}</text>`,
        `<text x="${valueX}" y="${y + 43}" text-anchor="end" class="cost-value">${escapeXml(cost)}</text>`,
      );
    });
    cursor += blockHeight + groupGap;
  });
  const legend: string[] = phaseLegend(margin);
  const empty: string[] =
    report.cells.length === 0
      ? [
          `<text x="${labelX}" y="${headerHeight + 28}" class="empty">No launched cells</text>`,
        ]
      : [];
  const notes: string[] = metric.tableNotes.map(
    (note, index) =>
      `<text x="${margin}" y="${height - 34 - (metric.tableNotes.length - 1 - index) * 15}" class="table-note">${escapeXml(note)}</text>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title id="title">${escapeXml(metric.title)}</title>`,
    `<desc id="description">${escapeXml(metric.description)}</desc>`,
    CHART_STYLE,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margin}" y="38" class="title">${escapeXml(metric.title)}</text>`,
    `<text x="${margin}" y="62" class="subtitle">${escapeXml(metric.subtitle)}</text>`,
    ...legend,
    ...body,
    ...empty,
    ...notes,
    `<text x="${margin}" y="${height - 14}" class="generated">Generated ${escapeXml(report.generatedAt)}</text>`,
    "</svg>",
    "",
  ].join("\n");
};

const phaseValues = (
  cell: IEvidenceBenchmarkReportCell,
  select: (stage: IEvidenceBenchmarkReportCell["stages"][number]) => number,
): readonly IPhaseValue[] => {
  const values: Record<PhaseName, number> = {
    "backend-development": 0,
    "backend-review": 0,
    "frontend-development": 0,
    "frontend-review": 0,
    "overall-review": 0,
  };
  for (const stage of cell.stages)
    values[stagePhase(stage.name)] += select(stage);
  return PHASES.map((phase) => ({
    name: phase.name,
    short: phase.short,
    value: values[phase.name],
  }));
};

const stagePhase = (stage: string): PhaseName => {
  // Supplementation reminders belong to the Review they supplement, however
  // many of them a scope needed. The bound lives on the instruction module, so
  // raising it there must not silently drop stages out of a chart here.
  const supplement = /^(backend|frontend|overall)-remind-([1-9][0-9]*)$/u.exec(
    stage,
  );
  if (
    supplement !== null &&
    Number(supplement[2]) <=
      EvidenceBenchmarkInstruction.REVIEW_SUPPLEMENT_LIMIT
  )
    return `${supplement[1] as "backend" | "frontend" | "overall"}-review`;
  switch (stage) {
    case "backend-start":
      return "backend-development";
    case "backend-review":
    case "backend-remind":
    case "backend-final":
      return "backend-review";
    case "frontend-start":
      return "frontend-development";
    case "frontend-review":
    case "frontend-remind":
    case "frontend-final":
      return "frontend-review";
    case "overall-review":
    case "overall-remind":
    case "overall-final":
      return "overall-review";
    default:
      throw new Error(`Unknown benchmark stage: ${stage}`);
  }
};

const phaseValueLabel = (
  cell: IEvidenceBenchmarkReportCell,
  baseline: IEvidenceBenchmarkReportCell | undefined,
  metric: IPhaseMetric,
): string => {
  const value: number = metric.cellValue(cell);
  const baselineValue: number | undefined =
    baseline === undefined ? undefined : metric.cellValue(baseline);
  if (
    cell.arm !== "evidence" ||
    baselineValue === undefined ||
    baselineValue <= 0
  )
    return metric.format(value);
  const change: number = Math.round((value / baselineValue - 1) * 100);
  return `${metric.format(value)} (${change > 0 ? "+" : ""}${change}%)`;
};

/**
 * The two axes that carry no bar of their own.
 *
 * Work time and price track token spend closely enough that three charts of
 * the same shape said one thing three times. They read as text beside the bar
 * that does carry a shape, where a reader who wants them finds them and a
 * reader comparing spend is not asked to compare three pictures.
 */
const formatApiCostLine = (cell: IEvidenceBenchmarkReportCell): string => {
  const time: string = formatDuration(cell.workElapsedMs);
  if (cell.apiCost === null) return `${time} · API cost unavailable`;
  return `${time} · $${formatPrice(cell.apiCost.amountUsd)}`;
};

const armOrder = (arm: "plain" | "evidence"): number =>
  arm === "plain" ? 0 : 1;

const formatInteger = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

const formatApiCost = (cell: IEvidenceBenchmarkReportCell): string =>
  cell.apiCost === null ? "—" : `$${formatPrice(cell.apiCost.amountUsd)}`;

const formatPrice = (value: number): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** The campaign's subjects, smallest first — the order every view uses. */
const SUBJECT_ORDER: readonly string[] = ["todo", "reddit", "shopping", "erp"];

const subjectRank = (subject: string): number => {
  const at: number = SUBJECT_ORDER.indexOf(subject);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
};

const armColor = (arm: "plain" | "evidence"): string =>
  arm === "plain" ? "#4c78a8" : "#f58518";

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens} tokens`;
  if (tokens < 1_000_000)
    return `${stripTrailingZero((tokens / 1_000).toFixed(1))}k tokens`;
  return `${stripTrailingZero((tokens / 1_000_000).toFixed(1))}M tokens`;
}

function formatDuration(elapsedMs: number): string {
  const minutes: number = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const stripTrailingZero = (value: string): string => value.replace(/\.0$/u, "");

const title = (value: string): string =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

/**
 * Names the model as the engine that ran it names it.
 *
 * Title-casing it produced `GPT-5.6-Luna`, which is nothing the runner, the
 * session or the price list calls it. A reader who wants to reproduce a figure
 * needs the string those accept, and the engine is part of it.
 */
const displayModel = (model: string): string => `codex ${model}`;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
