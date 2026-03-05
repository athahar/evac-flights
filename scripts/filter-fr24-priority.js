import fs from "node:fs";
import path from "node:path";

const DEFAULT_PRIORITY = ["LHR", "MAN", "LIS", "DUB", "FCO", "MUC", "ZRH", "WAW", "PRG", "VNO", "BUD"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args[key] = value;
  }
  return args;
}

function parseTsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return { headers: [], rows: [] };

  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = cols[i] || "";
    }
    return row;
  });

  return { headers, rows };
}

function writeTsv(filePath, headers, rows) {
  const lines = [
    headers.join("\t"),
    ...rows.map((row) => headers.map((h) => row[h] || "").join("\t"))
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const input = path.resolve(cwd, args.input || "./data/output/fr24-march-05.no-me.scheduled-estimated.tsv");
  const output = path.resolve(cwd, args.output || "./data/output/fr24-march-05.no-me.priority.tsv");

  const priority = (args.priority || DEFAULT_PRIORITY.join(","))
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

  const { headers, rows } = parseTsv(input);
  if (headers.length === 0) {
    throw new Error(`No data found in input file: ${input}`);
  }

  const prioritySet = new Set(priority);
  const filtered = rows.filter((row) => prioritySet.has(String(row.destination_iata || "").toUpperCase()));

  writeTsv(output, headers, filtered);

  const byDest = {};
  for (const row of filtered) {
    const d = row.destination_iata;
    byDest[d] = (byDest[d] || 0) + 1;
  }

  console.log(`Input rows: ${rows.length}`);
  console.log(`Priority rows: ${filtered.length}`);
  console.log(`Destinations: ${Object.keys(byDest).sort().join(", ")}`);
  console.log(`Output: ${output}`);
  console.log("Counts by destination:");
  for (const dest of Object.keys(byDest).sort()) {
    console.log(`  ${dest}: ${byDest[dest]}`);
  }
}

main();
