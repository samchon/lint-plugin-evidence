const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "../src");
const moduleFile = path.join(source, "module.ts");
if (fs.existsSync(moduleFile) === false)
  throw new Error(`Nestia did not generate ${moduleFile}.`);

let content = fs.readFileSync(moduleFile, "utf8");
for (const folder of ["structures", "diagnosers", "typings"]) {
  if (fs.existsSync(path.join(source, folder, "index.ts")) === false) continue;
  const statement = `export * from "./${folder}";`;
  if (content.includes(statement) === false) content += `\n${statement}\n`;
}
fs.writeFileSync(moduleFile, content.replace(/\r\n/g, "\n"), "utf8");
