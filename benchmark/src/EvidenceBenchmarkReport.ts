import fs from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { collectEvidenceBenchmarkReport } from "./EvidenceBenchmarkDashboard.ts";
import type {
  IEvidenceBenchmarkReport,
  IEvidenceBenchmarkReportCell,
} from "./structures/IEvidenceBenchmarkReport.ts";

export interface IEvidenceBenchmarkReportOptions {
  repository: string;
  output: string;
  generatedAt?: Date;
}

/** Writes the latest-run JSON aggregate, stable cells, and comparison charts. */
export const writeEvidenceBenchmarkReport = (
  options: IEvidenceBenchmarkReportOptions,
): IEvidenceBenchmarkReport => {
  const report: IEvidenceBenchmarkReport = collectEvidenceBenchmarkReport(
    options.repository,
    options.generatedAt,
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
    const svg: string = renderBarChart(report, chart);
    fs.writeFileSync(path.join(output, chart.file), svg);
    fs.writeFileSync(
      path.join(output, chart.file.replace(/\.svg$/u, ".png")),
      new Resvg(svg).render().asPng(),
    );
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
