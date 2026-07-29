import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = [
  "01-actors-and-auth.md",
  "02-domain-model.md",
  "03-functional-requirements.md",
  "04-business-rules.md",
  "05-non-functional.md",
];
const frozenFiles = [
  "00-corpus-contract.md",
  "00-toc.md",
  ...sourceFiles,
  "acceptance-criteria.jsonl",
  "acceptance-criteria.schema.json",
  "context-criteria.jsonl",
  "requirement-links.jsonl",
  "validate.mjs",
].sort();
const expectedFiles = new Set([
  ...frozenFiles,
  "corpus-manifest.json",
]);

const errors = [];
const reject = (message) => errors.push(message);
const isJsonObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const readBytes = (name) => fs.readFileSync(path.join(root, name));
const readText = (name) => {
  const bytes = readBytes(name);
  const text = bytes.toString("utf8");
  if (text.includes("\r")) reject(`${name}: CR or CRLF line ending`);
  if (!text.endsWith("\n")) reject(`${name}: missing final LF`);
  text.split("\n").forEach((line, index) => {
    if (/[ \t]$/u.test(line)) reject(`${name}:${index + 1}: trailing whitespace`);
  });
  return text;
};
const parseJsonLines = (name) => {
  const lines = readText(name).split("\n");
  lines.pop();
  const rows = [];
  lines.forEach((line, index) => {
    if (line.length === 0) {
      reject(`${name}:${index + 1}: blank JSONL record`);
      return;
    }
    try {
      const row = JSON.parse(line);
      if (!isJsonObject(row)) {
        reject(`${name}:${index + 1}: JSONL record must be an object`);
        return;
      }
      rows.push(row);
    } catch (error) {
      reject(`${name}:${index + 1}: invalid JSON: ${error.message}`);
    }
  });
  return rows;
};
const splitStatements = (lines) => {
  const statements = [];
  for (const line of lines) {
    const text = line.trim().replace(/^-\s+/u, "");
    if (!text) continue;
    for (const sentence of text.split(/(?<=[.!?])\s+/u)) {
      if (sentence.trim()) statements.push(sentence.trim());
    }
  }
  return statements;
};
const topicOf = (id) => id.replace(/^REQ-(?:AUTH|DOM|FUN|RULE|NFR)-/u, "");

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) reject(`${entry.name}: corpus root must contain files only`);
  else if (!expectedFiles.has(entry.name)) reject(`${entry.name}: unexpected corpus file`);
}
for (const name of expectedFiles) {
  if (!fs.existsSync(path.join(root, name))) reject(`${name}: missing corpus file`);
}

const h2 = new Map();
const h3 = new Map();
const h2Statements = new Map();
const leafStatements = new Map();
const h2Order = [];
const h3Order = [];
const references = [];

for (const name of sourceFiles) {
  const lines = readText(name).split("\n");
  const h1Lines = lines.filter((line) => /^# [^#]/u.test(line));
  if (h1Lines.length !== 1 || !/^# /u.test(lines[0])) {
    reject(`${name}: must begin with exactly one H1`);
  }
  let parent = null;
  let groupOwner = null;
  let groupLines = [];
  let leaf = null;
  let leafLines = [];
  const flushGroup = () => {
    if (!groupOwner) return;
    const statements = splitStatements(groupLines);
    if (statements.length === 0) reject(`${name}: ${groupOwner} has no context statement`);
    const duplicate = statements.find(
      (statement, index) => statements.indexOf(statement) !== index,
    );
    if (duplicate) reject(`${name}: ${groupOwner} repeats context: ${duplicate}`);
    h2Statements.set(groupOwner, statements);
    groupOwner = null;
    groupLines = [];
  };
  const flushLeaf = () => {
    if (!leaf) return;
    const statements = splitStatements(leafLines);
    if (statements.length === 0) reject(`${name}: ${leaf} has no acceptance statement`);
    const duplicate = statements.find(
      (statement, index) => statements.indexOf(statement) !== index,
    );
    if (duplicate) reject(`${name}: ${leaf} repeats statement: ${duplicate}`);
    leafStatements.set(leaf, statements);
    leaf = null;
    leafLines = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/\bundefined\b|\b(?:TBD|TBC|TODO)\b|\?\?/u.test(line)) {
      reject(`${name}:${lineNumber}: placeholder text`);
    }
    for (const match of line.matchAll(/\bREQ-[A-Z0-9-]+\b/gu)) {
      references.push({ id: match[0], name, lineNumber });
    }

    const group = /^## (REQ-[A-Z0-9-]+): (.+)$/u.exec(line);
    if (group) {
      flushLeaf();
      flushGroup();
      parent = group[1];
      if (h2.has(parent)) reject(`${name}:${lineNumber}: duplicate H2 ${parent}`);
      h2.set(parent, { name, lineNumber, title: group[2], children: [] });
      h2Order.push(parent);
      groupOwner = parent;
      return;
    }
    const child = /^### (REQ-[A-Z0-9-]+)-(\d{3}): (.+)$/u.exec(line);
    if (child) {
      flushLeaf();
      flushGroup();
      leaf = `${child[1]}-${child[2]}`;
      if (!parent) reject(`${name}:${lineNumber}: H3 without H2 parent`);
      else if (child[1] !== parent) {
        reject(`${name}:${lineNumber}: ${leaf} is not a child of ${parent}`);
      }
      if (h3.has(leaf)) reject(`${name}:${lineNumber}: duplicate H3 ${leaf}`);
      h3.set(leaf, {
        name,
        lineNumber,
        title: child[3],
        parent,
        ordinal: Number(child[2]),
      });
      h3Order.push(leaf);
      h2.get(parent)?.children.push(leaf);
      return;
    }
    if (/^#{2,3} /u.test(line)) {
      reject(`${name}:${lineNumber}: malformed requirement heading`);
    } else if (leaf) {
      leafLines.push(line);
    } else if (groupOwner) {
      groupLines.push(line);
    }
  });
  flushLeaf();
  flushGroup();
}

for (const [id, group] of h2) {
  if (group.children.length === 0) {
    reject(`${group.name}:${group.lineNumber}: ${id} has no H3 children`);
  }
  const ordinals = group.children.map((child) => h3.get(child).ordinal);
  ordinals.forEach((ordinal, index) => {
    if (ordinal !== index + 1) {
      reject(`${group.name}:${group.lineNumber}: ${id} child sequence is not 001..N`);
    }
  });
}
const definitions = new Set([...h2.keys(), ...h3.keys()]);
for (const reference of references) {
  if (!definitions.has(reference.id)) {
    reject(`${reference.name}:${reference.lineNumber}: unknown reference ${reference.id}`);
  }
}
if (h2.size < 253) reject(`H2 denominator shrank below raw baseline: ${h2.size} < 253`);
if (h3.size < 1234) reject(`H3 denominator shrank below raw baseline: ${h3.size} < 1234`);

let criterionSchema = null;
try {
  criterionSchema = JSON.parse(readText("acceptance-criteria.schema.json"));
} catch (error) {
  reject(`acceptance-criteria.schema.json: invalid JSON: ${error.message}`);
}
if (!isJsonObject(criterionSchema)) {
  reject("acceptance-criteria.schema.json: schema must be an object");
} else {
  const expectedSources = JSON.stringify(sourceFiles);
  if (
    criterionSchema.type !== "object"
    || criterionSchema.additionalProperties !== false
    || JSON.stringify(criterionSchema.required) !== JSON.stringify([
      "id",
      "requirement",
      "source",
      "criterion",
    ])
    || criterionSchema.properties?.id?.pattern !== "^REQ-[A-Z0-9-]+\\.(?:AC|CTX)-[0-9]{2}$"
    || criterionSchema.properties?.requirement?.pattern !== "^REQ-[A-Z0-9-]+$"
    || JSON.stringify(criterionSchema.properties?.source?.enum) !== expectedSources
    || criterionSchema.properties?.criterion?.type !== "string"
    || criterionSchema.properties?.criterion?.minLength !== 1
  ) {
    reject("acceptance-criteria.schema.json: schema contract differs");
  }
}

const validateInventory = ({
  filename,
  rows,
  owners,
  statementsByOwner,
  ownerOrder,
  suffix,
}) => {
  const rowIds = new Set();
  const rowsByOwner = new Map();
  for (const [index, row] of rows.entries()) {
    const location = `${filename}:${index + 1}`;
    if (Object.keys(row).join(",") !== "id,requirement,source,criterion") {
      reject(`${location}: fields must be exactly id, requirement, source, criterion`);
      continue;
    }
    if (row.id !== `${row.requirement}.${suffix}-${String(
      (rowsByOwner.get(row.requirement)?.length ?? 0) + 1,
    ).padStart(2, "0")}`) {
      reject(`${location}: id or owner-local sequence is invalid`);
    }
    if (!owners.has(row.requirement)) {
      reject(`${location}: unknown or wrong-kind owner ${row.requirement}`);
    } else if (owners.get(row.requirement).name !== row.source) {
      reject(`${location}: source does not own ${row.requirement}`);
    }
    if (
      typeof row.criterion !== "string"
      || row.criterion.trim() !== row.criterion
      || !row.criterion
    ) {
      reject(`${location}: criterion must be nonempty trimmed text`);
    }
    if (rowIds.has(row.id)) reject(`${location}: duplicate id ${row.id}`);
    rowIds.add(row.id);
    if (!rowsByOwner.has(row.requirement)) rowsByOwner.set(row.requirement, []);
    rowsByOwner.get(row.requirement).push(row.criterion);
  }
  for (const [owner, statements] of statementsByOwner) {
    const inventory = rowsByOwner.get(owner) ?? [];
    if (JSON.stringify(inventory) !== JSON.stringify(statements)) {
      reject(`${owner}: ${filename} does not exactly match source statements`);
    }
  }
  for (const owner of rowsByOwner.keys()) {
    if (!statementsByOwner.has(owner)) reject(`${owner}: ${filename} has no source owner`);
  }
  const actualOrder = rows
    .map((row) => row.requirement)
    .filter((owner, index, values) => index === 0 || owner !== values[index - 1]);
  if (JSON.stringify(actualOrder) !== JSON.stringify(ownerOrder)) {
    reject(`${filename}: owner blocks differ from global source order`);
  }
};

const criteria = parseJsonLines("acceptance-criteria.jsonl");
validateInventory({
  filename: "acceptance-criteria.jsonl",
  rows: criteria,
  owners: h3,
  statementsByOwner: leafStatements,
  ownerOrder: h3Order,
  suffix: "AC",
});
const contexts = parseJsonLines("context-criteria.jsonl");
validateInventory({
  filename: "context-criteria.jsonl",
  rows: contexts,
  owners: h2,
  statementsByOwner: h2Statements,
  ownerOrder: h2Order,
  suffix: "CTX",
});

const links = parseJsonLines("requirement-links.jsonl");
const linkKeys = new Set();
const incident = new Set();
const journeyCounts = new Map();
for (const [index, link] of links.entries()) {
  const location = `requirement-links.jsonl:${index + 1}`;
  if (Object.keys(link).join(",") !== "source,target,relation") {
    reject(`${location}: fields must be exactly source, target, relation`);
    continue;
  }
  if (!h2.has(link.source)) reject(`${location}: unknown source H2 ${link.source}`);
  if (!h2.has(link.target)) reject(`${location}: unknown target H2 ${link.target}`);
  if (link.source >= link.target) reject(`${location}: endpoints must be canonical lexical order`);
  if (!["same-topic", "cross-cutting", "journey"].includes(link.relation)) {
    reject(`${location}: invalid relation ${link.relation}`);
  }
  if (
    link.relation === "same-topic"
    && topicOf(link.source) !== topicOf(link.target)
  ) {
    reject(`${location}: same-topic endpoints do not share a topic`);
  }
  if (link.relation === "journey") {
    const journeyEndpoints = [link.source, link.target].filter((id) =>
      id.startsWith("REQ-JRN-")
    );
    if (journeyEndpoints.length !== 1) {
      reject(`${location}: journey relation must have one journey and one non-journey H2`);
    } else {
      const journey = journeyEndpoints[0];
      journeyCounts.set(journey, (journeyCounts.get(journey) ?? 0) + 1);
    }
  }
  const key = `${link.source}\0${link.target}`;
  if (linkKeys.has(key)) reject(`${location}: duplicate undirected link`);
  linkKeys.add(key);
  incident.add(link.source);
  incident.add(link.target);
}
for (const id of h2.keys()) {
  if (!incident.has(id)) reject(`${id}: H2 is absent from requirement-links.jsonl`);
  if (id.startsWith("REQ-JRN-") && journeyCounts.get(id) !== 1) {
    reject(`${id}: journey H2 must have exactly one journey relation`);
  }
}

let manifest = null;
try {
  manifest = JSON.parse(readText("corpus-manifest.json"));
} catch (error) {
  reject(`corpus-manifest.json: invalid JSON: ${error.message}`);
}
if (!isJsonObject(manifest)) {
  reject("corpus-manifest.json: manifest must be an object");
} else {
  if (
    Object.keys(manifest).join(",")
    !== "schemaVersion,h2,h3,acceptanceCriteria,contextCriteria,links,files,aggregateSha256"
  ) {
    reject("corpus-manifest.json: fields or field order differ");
  }
  if (manifest.schemaVersion !== 1) reject("corpus-manifest.json: schemaVersion must be 1");
  const counts = {
    h2: h2.size,
    h3: h3.size,
    acceptanceCriteria: criteria.length,
    contextCriteria: contexts.length,
    links: links.length,
  };
  for (const [key, value] of Object.entries(counts)) {
    if (manifest[key] !== value) reject(`corpus-manifest.json: ${key} must equal ${value}`);
  }
  const actualFiles = frozenFiles.map((name) => ({
    path: name,
    sha256: crypto.createHash("sha256").update(readBytes(name)).digest("hex"),
  }));
  if (JSON.stringify(manifest.files) !== JSON.stringify(actualFiles)) {
    reject("corpus-manifest.json: file hash inventory differs");
  }
  const aggregate = crypto.createHash("sha256");
  for (const entry of actualFiles) {
    aggregate.update(entry.path, "utf8");
    aggregate.update(Buffer.from([0]));
    aggregate.update(readBytes(entry.path));
    aggregate.update(Buffer.from([0]));
  }
  const aggregateSha256 = aggregate.digest("hex");
  if (manifest.aggregateSha256 !== aggregateSha256) {
    reject(`corpus-manifest.json: aggregateSha256 must equal ${aggregateSha256}`);
  }
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      h2: h2.size,
      h3: h3.size,
      acceptanceCriteria: criteria.length,
      contextCriteria: contexts.length,
      links: links.length,
      aggregateSha256: manifest.aggregateSha256,
    })}\n`,
  );
}
