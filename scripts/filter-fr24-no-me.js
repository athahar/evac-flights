import fs from "node:fs";
import path from "node:path";

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

function toIata(destinationLine) {
  const m = String(destinationLine || "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim().toUpperCase() : "";
}

function toCity(destinationLine) {
  return String(destinationLine || "").replace(/\s*\([^)]+\)\s*$/, "").trim();
}

function parseAirlineAndAircraft(line) {
  const parts = String(line || "").split("\t").map((x) => x.trim()).filter(Boolean);
  return {
    airline: parts[0] || "",
    aircraft: parts[1] || ""
  };
}

function parseRows(lines) {
  const rows = [];
  let sectionDate = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || "";

    if (/^[A-Za-z]+,\s+[A-Za-z]{3}\s+\d{2}$/.test(line.trim())) {
      sectionDate = line.trim();
      continue;
    }

    if (!/^\d{1,2}:\d{2} [AP]M\t/.test(line)) {
      continue;
    }

    const firstParts = line.split("\t");
    const timeLocal = (firstParts[0] || "").trim();
    const flight = (firstParts[1] || "").trim();

    const destinationLine = (lines[i + 1] || "").trim();
    const airlineAircraftLine = (lines[i + 2] || "").trim();
    const status = (lines[i + 3] || "").trim();

    const { airline, aircraft } = parseAirlineAndAircraft(airlineAircraftLine);

    rows.push({
      sectionDate,
      timeLocal,
      flight,
      destinationCity: toCity(destinationLine),
      destinationIata: toIata(destinationLine),
      airline,
      aircraft,
      status
    });
  }

  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, args.input || "./data/input/fr24-march-05");
  const outputPath = path.resolve(cwd, args.output || "./data/output/fr24-march-05.no-me.scheduled-estimated.tsv");
  const blocklistPath = path.resolve(cwd, args.blocklist || "./config/blocked_middle_east.json");

  const lines = fs.readFileSync(inputPath, "utf-8").split(/\r?\n/);
  const blocklist = JSON.parse(fs.readFileSync(blocklistPath, "utf-8"));
  const blockedAirports = new Set((blocklist.airports || []).map((x) => String(x).toUpperCase()));

  const rows = parseRows(lines);

  const filtered = rows.filter((row) => {
    const statusOk = row.status === "Scheduled" || row.status.startsWith("Estimated");
    const destinationOk = row.destinationIata && !blockedAirports.has(row.destinationIata);
    return statusOk && destinationOk;
  });

  const header = [
    "section_date",
    "time_local",
    "flight",
    "destination_city",
    "destination_iata",
    "airline",
    "aircraft",
    "status"
  ];

  const tsvLines = [
    header.join("\t"),
    ...filtered.map((row) => [
      row.sectionDate,
      row.timeLocal,
      row.flight,
      row.destinationCity,
      row.destinationIata,
      row.airline,
      row.aircraft,
      row.status
    ].join("\t"))
  ];

  fs.writeFileSync(outputPath, `${tsvLines.join("\n")}\n`, "utf-8");

  const scheduledCount = filtered.filter((x) => x.status === "Scheduled").length;
  const estimatedCount = filtered.filter((x) => x.status.startsWith("Estimated")).length;

  console.log(`Input rows parsed: ${rows.length}`);
  console.log(`Filtered rows written: ${filtered.length}`);
  console.log(`Scheduled: ${scheduledCount}`);
  console.log(`Estimated: ${estimatedCount}`);
  console.log(`Output: ${outputPath}`);
}

main();
