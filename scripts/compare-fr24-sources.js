import dotenv from "dotenv";
import { assertRequiredConfig, loadConfig } from "../lib/config.js";
import { getDateRangeIso, loadFr24Data, parseFr24File } from "../lib/fr24.js";

dotenv.config();

function makeKey(row) {
  const carrierCode = String(row?.carrierCode || "").trim().toUpperCase();
  const flightNumber = String(row?.flightNumber || "").trim().toUpperCase();
  const flightDate = String(row?.flightDate || "").trim();
  return `${carrierCode}${flightNumber}|${flightDate}`;
}

function toPercent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function computeCoverage(rows) {
  if (!rows.length) {
    return {
      statusCoverage: 0,
      flightCoverage: 0,
      destinationCoverage: 0,
      departureCoverage: 0
    };
  }
  const statusCoverage = toPercent(rows.filter((row) => String(row?.status || "").trim().length > 0).length, rows.length);
  const flightCoverage = toPercent(rows.filter((row) => String(row?.flight || "").trim().length > 0).length, rows.length);
  const destinationCoverage = toPercent(
    rows.filter((row) => String(row?.destinationIata || "").trim().length === 3).length,
    rows.length
  );
  const departureCoverage = toPercent(
    rows.filter((row) => String(row?.departureLocalIso || "").trim().length >= 19).length,
    rows.length
  );
  return {
    statusCoverage,
    flightCoverage,
    destinationCoverage,
    departureCoverage
  };
}

function toStatusBucket(status) {
  const text = String(status || "").trim();
  if (!text) return "EMPTY";
  return text.toLowerCase();
}

function countStatuses(rows) {
  const counts = new Map();
  for (const row of rows) {
    const bucket = toStatusBucket(row?.status);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  return counts;
}

function printCoverage(label, coverage) {
  console.log(
    `${label}: status=${coverage.statusCoverage.toFixed(1)}% flight=${coverage.flightCoverage.toFixed(1)}% destination=${coverage.destinationCoverage.toFixed(1)}% departure=${coverage.departureCoverage.toFixed(1)}%`
  );
}

function printStatusDiff(apiRows, fileRows) {
  const apiCounts = countStatuses(apiRows);
  const fileCounts = countStatuses(fileRows);
  const allStatuses = [...new Set([...apiCounts.keys(), ...fileCounts.keys()])].sort();

  console.log("\nStatus distribution diff:");
  if (allStatuses.length === 0) {
    console.log("(none)");
    return;
  }

  for (const status of allStatuses) {
    const apiCount = apiCounts.get(status) || 0;
    const fileCount = fileCounts.get(status) || 0;
    const delta = apiCount - fileCount;
    const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
    console.log(`- ${status}: api=${apiCount} file=${fileCount} delta=${deltaLabel}`);
  }
}

async function main() {
  const config = loadConfig(process.env);
  const allowedDates = getDateRangeIso(config.dashboardTimezone, config.dashboardLookaheadDays);
  const apiConfig = {
    ...config,
    fr24ApiEnabled: true,
    fr24ApiFallbackToFile: false
  };

  assertRequiredConfig(apiConfig);

  const apiLoaded = await loadFr24Data(apiConfig, { allowedDates });
  const apiRows = apiLoaded.rows || [];
  const fileRows = parseFr24File(config.fr24InputFile);

  const apiByKey = new Map(apiRows.map((row) => [makeKey(row), row]));
  const fileByKey = new Map(fileRows.map((row) => [makeKey(row), row]));
  const apiKeys = new Set(apiByKey.keys());
  const fileKeys = new Set(fileByKey.keys());
  const overlapCount = [...apiKeys].filter((key) => fileKeys.has(key)).length;
  const unionCount = new Set([...apiKeys, ...fileKeys]).size;
  const overlapPercent = toPercent(overlapCount, unionCount || 1);

  const apiOnlyKeys = [...apiKeys].filter((key) => !fileKeys.has(key));
  const fileOnlyKeys = [...fileKeys].filter((key) => !apiKeys.has(key));

  console.log("FR24 source comparison");
  console.log(`- apiRows=${apiRows.length}`);
  console.log(`- fileRows=${fileRows.length}`);
  console.log(`- overlap=${overlapCount}/${unionCount} (${overlapPercent.toFixed(2)}%)`);
  console.log(`- apiOnlyFlights=${apiOnlyKeys.length}`);
  console.log(`- fileOnlyFlights=${fileOnlyKeys.length}`);

  if (apiOnlyKeys.length > 0) {
    console.log("\nAPI-only flights (up to 25):");
    for (const key of apiOnlyKeys.slice(0, 25)) {
      console.log(`- ${key}`);
    }
  }

  if (fileOnlyKeys.length > 0) {
    console.log("\nFile-only flights (up to 25):");
    for (const key of fileOnlyKeys.slice(0, 25)) {
      console.log(`- ${key}`);
    }
  }

  console.log("\nField coverage:");
  printCoverage("api", computeCoverage(apiRows));
  printCoverage("file", computeCoverage(fileRows));
  printStatusDiff(apiRows, fileRows);

  process.exit(overlapPercent > 95 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
