import fs from "node:fs";
import path from "node:path";

import { collectEvidenceBenchmarkReport } from "./EvidenceBenchmarkDashboard.ts";
import type {
  IEvidenceBenchmarkReport,
  IEvidenceBenchmarkReportCell,
} from "./structures/IEvidenceBenchmarkReport.ts";

export interface IEvidenceBenchmarkReportOptions {
  repository: string;
  output: string;
  generatedAt?: Date;
  runIds?: readonly string[];
}

/** Writes the latest-run JSON aggregate, stable cells, and comparison charts. */
export const writeEvidenceBenchmarkReport = (
  options: IEvidenceBenchmarkReportOptions,
): IEvidenceBenchmarkReport => {
  const report: IEvidenceBenchmarkReport = collectEvidenceBenchmarkReport(
    options.repository,
    options.generatedAt,
    options.runIds,
    true,
  );
  const output: string = path.resolve(options.output);
  fs.mkdirSync(output, { recursive: true });
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
  for (const chart of CHARTS) {
    fs.rmSync(path.join(output, chart.file.replace(/\.svg$/u, ".png")), {
      force: true,
    });
    const svg: string =
      chart.file === "tokens.svg"
        ? renderTokenChart(report)
        : chart.file === "work-time.svg"
          ? renderWorkTimeChart(report)
          : renderBarChart(report, chart);
    fs.writeFileSync(path.join(output, chart.file), svg);
  }
  return report;
};

const pathSegment = (value: string): string => {
  const encoded: string = encodeURIComponent(value);
  return encoded === "." || encoded === ".."
    ? encoded.replaceAll(".", "%2E")
    : encoded;
};

interface IChart {
  file: string;
  title: string;
  description: string;
  value: (cell: IEvidenceBenchmarkReportCell) => number;
  format: (value: number) => string;
}

const CHARTS: readonly IChart[] = [
  {
    file: "tokens.svg",
    title: "Benchmark token usage",
    description: "Retained work tokens for the latest launched benchmark cells",
    value: (cell) => cell.tokens,
    format: formatTokens,
  },
  {
    file: "work-time.svg",
    title: "Benchmark work time",
    description:
      "Retained native process time for the latest launched benchmark cells",
    value: (cell) => cell.workElapsedMs,
    format: formatDuration,
  },
  {
    file: "wall-time.svg",
    title: "Benchmark wall time",
    description:
      "Launch-to-observation time for the latest launched benchmark cells",
    value: (cell) => cell.wallElapsedMs,
    format: formatDuration,
  },
];

type PhaseName =
  | "backend-development"
  | "backend-review"
  | "frontend-development"
  | "frontend-review"
  | "overall-review";

const API_PRICE_NOTE =
  "API cost uses OpenRouter rates from 2026-08-01 and is emitted only after raw requests reconcile with retained counters.";

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

const WORK_TIME_TABLE_COLUMNS: IPhaseMetric["tableColumns"] = [
  { label: "Project", x: 60 },
  { label: "Arm", x: 145 },
  { label: "API cost", x: 300 },
  { label: "Total", x: 430 },
  { label: "Backend Dev", x: 620 },
  { label: "Backend Review", x: 815 },
  { label: "Frontend Dev", x: 1_000 },
  { label: "Frontend Review", x: 1_190 },
  { label: "Overall Review", x: 1_395 },
];

const renderTokenChart = (report: IEvidenceBenchmarkReport): string =>
  renderPhaseChart(report, {
    title: "Benchmark token usage by project",
    description:
      "Plain and Evidence share one token axis. Stacked shades separate backend development and review, frontend development and review, and overall review.",
    subtitle:
      "Plain and Evidence share one token axis; stacked shades show development and review phases (lower is better).",
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

const renderWorkTimeChart = (report: IEvidenceBenchmarkReport): string =>
  renderPhaseChart(report, {
    title: "Benchmark work time by project",
    description:
      "Plain and Evidence share one work-time axis. Stacked shades separate backend development and review, frontend development and review, and overall review.",
    subtitle:
      "Plain and Evidence share one Work Time axis; stacked shades show development and review phases (lower is better).",
    tableTitle: "Work Time details",
    tableColumns: WORK_TIME_TABLE_COLUMNS,
    tableValues: (cell, phases) => [
      title(cell.subject),
      title(cell.arm),
      formatApiCost(cell),
      formatDuration(cell.workElapsedMs),
      ...phases.map((phase) => formatDuration(phase.value)),
    ],
    tableNotes: [
      "Each Final is included in Review; the gray remainder is native process overhead. All values are retained Work Time.",
      API_PRICE_NOTE,
    ],
    dataAttribute: "ms",
    cellValue: (cell) => cell.workElapsedMs,
    stageValue: (stage) => stage.elapsedMs,
    format: formatDuration,
  });

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
  const tableRowHeight: number = 28;
  const tableHeight: number =
    76 +
    Math.max(1, report.cells.length) * tableRowHeight +
    metric.tableNotes.length * 15;
  const labelX: number = 60;
  const barX: number = 210;
  const barMaximumWidth: number = 900;
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
  const height: number =
    headerHeight + groupContentHeight + tableHeight + footerHeight;
  const maximum: number = Math.max(1, ...report.cells.map(metric.cellValue));
  let cursor: number = headerHeight;
  const body: string[] = [];
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
      body.push(
        `<text x="${valueX}" y="${y + 19}" text-anchor="end" class="value">${escapeXml(label)}</text>`,
        `<text x="${valueX}" y="${y + 43}" text-anchor="end" class="cost-value">${escapeXml(cost)}</text>`,
      );
    });
    cursor += blockHeight + groupGap;
  });
  const legend: string[] = [];
  let legendX: number = margin;
  PHASES.forEach((phase, index) => {
    legend.push(
      `<rect x="${legendX}" y="82" width="18" height="12" rx="3" fill="${armColor("plain")}" fill-opacity="${PHASE_OPACITY[index]}"/>`,
      `<text x="${legendX + 25}" y="93" class="legend">${escapeXml(phase.label)}</text>`,
    );
    legendX += 250;
  });
  const empty: string[] =
    report.cells.length === 0
      ? [
          `<text x="${labelX}" y="${headerHeight + 28}" class="empty">No launched cells</text>`,
        ]
      : [];
  const tableY: number = headerHeight + groupContentHeight + 26;
  const columns: IPhaseMetric["tableColumns"] = metric.tableColumns;
  const table: string[] = [
    `<text x="${margin}" y="${tableY}" class="table-title">${escapeXml(metric.tableTitle)}</text>`,
    `<line x1="${margin}" y1="${tableY + 16}" x2="${width - margin}" y2="${tableY + 16}" class="table-rule"/>`,
    ...columns.map(
      (column, index) =>
        `<text x="${column.x}" y="${tableY + 38}"${index >= 2 ? ' text-anchor="end"' : ""} class="table-header">${escapeXml(column.label)}</text>`,
    ),
    `<line x1="${margin}" y1="${tableY + 47}" x2="${width - margin}" y2="${tableY + 47}" class="table-rule"/>`,
  ];
  report.cells.forEach((cell, index) => {
    const y: number = tableY + 48 + index * tableRowHeight;
    const values: readonly string[] = metric.tableValues(
      cell,
      phaseValues(cell, metric.stageValue),
    );
    values.forEach((value, columnIndex) =>
      table.push(
        `<text x="${columns[columnIndex]!.x}" y="${y + 19}"${columnIndex >= 2 ? ' text-anchor="end"' : ""} class="table-cell">${escapeXml(value)}</text>`,
      ),
    );
    table.push(
      `<line x1="${margin}" y1="${y + tableRowHeight}" x2="${width - margin}" y2="${y + tableRowHeight}" class="table-rule"/>`,
    );
  });
  metric.tableNotes.forEach((note, index) =>
    table.push(
      `<text x="${margin}" y="${tableY + 65 + Math.max(1, report.cells.length) * tableRowHeight + index * 15}" class="table-note">${escapeXml(note)}</text>`,
    ),
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title id="title">${escapeXml(metric.title)}</title>`,
    `<desc id="description">${escapeXml(metric.description)}</desc>`,
    "<style>",
    "  text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #172033; }",
    "  .title { font-size: 27px; font-weight: 700; }",
    "  .subtitle, .generated, .group-meta, .row-status { font-size: 13px; fill: #667085; }",
    "  .group { fill: #e8f2fb; }",
    "  .group-title { font-size: 21px; font-weight: 700; }",
    "  .row-label { font-size: 17px; font-weight: 700; }",
    "  .value { font-size: 16px; font-weight: 700; }",
    "  .cost-value { font-size: 13px; font-weight: 600; fill: #526b82; }",
    "  .legend { font-size: 12px; fill: #526b82; }",
    "  .segment-label { font-size: 10px; font-weight: 700; fill: #ffffff; paint-order: stroke; stroke: #172033; stroke-opacity: 0.28; stroke-width: 1px; }",
    "  .phase-segment { stroke: #ffffff; stroke-opacity: 0.86; stroke-width: 1px; }",
    "  .track { fill: #e7edf4; stroke: #d5dee9; stroke-width: 1px; }",
    "  .empty { font-size: 15px; fill: #667085; }",
    "  .table-title { font-size: 15px; font-weight: 600; }",
    "  .table-header { font-size: 11px; font-weight: 600; fill: #667085; }",
    "  .table-cell { font-size: 12px; fill: #334155; }",
    "  .table-rule { stroke: #dbe4ee; stroke-width: 1px; }",
    "  .table-note { font-size: 11px; fill: #667085; }",
    "</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margin}" y="38" class="title">${escapeXml(metric.title)}</text>`,
    `<text x="${margin}" y="62" class="subtitle">${escapeXml(metric.subtitle)}</text>`,
    ...legend,
    ...body,
    ...empty,
    ...table,
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

const formatApiCostLine = (cell: IEvidenceBenchmarkReportCell): string => {
  if (cell.apiCost === null) return "API cost unavailable";
  return `API cost $${formatPrice(cell.apiCost.amountUsd)}`;
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

const renderBarChart = (
  report: IEvidenceBenchmarkReport,
  chart: IChart,
): string => {
  const width: number = 1_200;
  const rowHeight: number = 52;
  const headerHeight: number = 128;
  const footerHeight: number = 34;
  const height: number =
    headerHeight + Math.max(1, report.cells.length) * rowHeight + footerHeight;
  const labelX: number = 32;
  const barX: number = 430;
  const barMaximumWidth: number = 620;
  const maximum: number = Math.max(1, ...report.cells.map(chart.value));
  const rows: string[] =
    report.cells.length === 0
      ? [
          `<text x="${labelX}" y="${headerHeight + 26}" class="empty">No launched cells</text>`,
        ]
      : report.cells.flatMap((cell, index) => {
          const value: number = chart.value(cell);
          const y: number = headerHeight + index * rowHeight;
          const barWidth: number = Math.max(
            value === 0 ? 0 : 2,
            Math.round((value / maximum) * barMaximumWidth),
          );
          return [
            `<text x="${labelX}" y="${y + 20}" class="label">${escapeXml(cellLabel(cell))}</text>`,
            `<text x="${labelX}" y="${y + 39}" class="stage">${escapeXml(stageLabel(cell))}</text>`,
            `<rect x="${barX}" y="${y + 9}" width="${barMaximumWidth}" height="28" rx="4" class="track"/>`,
            `<rect x="${barX}" y="${y + 9}" width="${barWidth}" height="28" rx="4" fill="${armColor(cell.arm)}"/>`,
            `<text x="${barX + barMaximumWidth + 18}" y="${y + 29}" class="value">${escapeXml(chart.format(value))}</text>`,
          ];
        });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title id="title">${escapeXml(chart.title)}</title>`,
    `<desc id="description">${escapeXml(chart.description)}</desc>`,
    "<style>",
    "  text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #172033; }",
    "  .title { font-size: 24px; font-weight: 700; }",
    "  .subtitle, .stage, .generated { font-size: 13px; fill: #667085; }",
    "  .label { font-size: 14px; font-weight: 650; }",
    "  .value { font-size: 14px; font-weight: 700; }",
    "  .legend { font-size: 13px; font-weight: 600; }",
    "  .empty { font-size: 15px; fill: #667085; }",
    "  .track { fill: #eef1f6; }",
    "</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${labelX}" y="38" class="title">${escapeXml(chart.title)}</text>`,
    `<text x="${labelX}" y="62" class="subtitle">${escapeXml(chart.description)}</text>`,
    `<rect x="${labelX}" y="82" width="14" height="14" rx="3" fill="${armColor("plain")}"/>`,
    `<text x="${labelX + 22}" y="94" class="legend">Plain</text>`,
    `<rect x="${labelX + 86}" y="82" width="14" height="14" rx="3" fill="${armColor("evidence")}"/>`,
    `<text x="${labelX + 108}" y="94" class="legend">Evidence</text>`,
    ...rows,
    `<text x="${labelX}" y="${height - 12}" class="generated">Generated ${escapeXml(report.generatedAt)}</text>`,
    "</svg>",
    "",
  ].join("\n");
};

const cellLabel = (cell: IEvidenceBenchmarkReportCell): string =>
  `${displayModel(cell.model)} · ${title(cell.subject)} ${title(cell.arm)} · ${cell.status}`;

const stageLabel = (cell: IEvidenceBenchmarkReportCell): string =>
  cell.stage === null ? "No instruction retained" : `Stage: ${cell.stage}`;

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

const displayModel = (model: string): string =>
  model
    .replace(/^gpt-/iu, "GPT-")
    .replace(/-([^-]+)$/u, (_, family: string) => `-${title(family)}`);

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
