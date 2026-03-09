import dotenv from "dotenv";
import { loadConfig } from "../lib/config.js";
import { loadFr24Data, filterFr24Rows, getDateRangeIso } from "../lib/fr24.js";
import { isCargoOperator } from "../lib/airlineLinks.js";

dotenv.config();

const config = loadConfig(process.env);
const timezone = config.dashboardTimezone || "Asia/Dubai";
const lookaheadDays = config.dashboardLookaheadDays;
const allowedDates = getDateRangeIso(timezone, lookaheadDays);

console.log("=== FR24 Filtering Pipeline Diagnostic ===");
console.log(`Timezone:         ${timezone}`);
console.log(`Lookahead days:   ${lookaheadDays}`);
console.log(`Allowed dates:    ${JSON.stringify(allowedDates)}`);
console.log(`Origin airports:  ${JSON.stringify(config.originAirports)}`);
console.log(`Now (UTC):        ${new Date().toISOString()}`);
console.log(`Blocked airports: ${JSON.stringify(config.blocklist?.airports || [])}`);
console.log();

// --- Helper: count rows per originAirport ---
function perOriginCounts(rows, defaultOrigin) {
  const counts = {};
  for (const row of rows) {
    const origin = String(row.originAirport || defaultOrigin || "UNKNOWN").toUpperCase();
    counts[origin] = (counts[origin] || 0) + 1;
  }
  return counts;
}

function printCounts(label, counts) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  console.log(`  ${label}: total=${total}  ${entries.map(([k, v]) => `${k}=${v}`).join("  ")}`);
}

// --- STAGE 1: loadFr24Data ---
const fr24Loaded = await loadFr24Data(config, { allowedDates });
const rawRows = fr24Loaded.rows || [];
const meta = fr24Loaded.meta || {};
const defaultOrigin = config.originAirports[0] || "DXB";

console.log(`\n--- STAGE 1: loadFr24Data (source=${meta.source || "unknown"}) ---`);
if (meta.filePaths) {
  console.log(`  Files loaded: ${meta.filePaths.join(", ")}`);
}
printCounts("Raw loaded rows", perOriginCounts(rawRows, defaultOrigin));

// Show date distribution per origin
const dateDistrib = {};
for (const row of rawRows) {
  const origin = String(row.originAirport || defaultOrigin).toUpperCase();
  const date = row.flightDate || "NO_DATE";
  const key = `${origin}/${date}`;
  dateDistrib[key] = (dateDistrib[key] || 0) + 1;
}
console.log(`  Date distribution:`);
for (const [key, count] of Object.entries(dateDistrib).sort()) {
  const inAllowed = allowedDates.includes(key.split("/")[1]) ? "OK" : "OUT_OF_RANGE";
  console.log(`    ${key}: ${count} rows  [${inAllowed}]`);
}

// Show status distribution per origin
const statusDistrib = {};
for (const row of rawRows) {
  const origin = String(row.originAirport || defaultOrigin).toUpperCase();
  const statusText = String(row.status || "");
  const statusType = statusText.startsWith("Estimated") ? "Estimated" : statusText;
  const key = `${origin}/${statusType || "EMPTY"}`;
  statusDistrib[key] = (statusDistrib[key] || 0) + 1;
}
console.log(`  Status distribution:`);
for (const [key, count] of Object.entries(statusDistrib).sort()) {
  console.log(`    ${key}: ${count}`);
}

// --- STAGE 2: filterFr24Rows ---
console.log(`\n--- STAGE 2: filterFr24Rows ---`);
console.log(`  Params: allowedStatuses=["Scheduled","Estimated"], allowedDates=${JSON.stringify(allowedDates)}, blockedAirports=(${(config.blocklist?.airports || []).length} entries)`);

const filteredRows = filterFr24Rows(rawRows, {
  allowedStatuses: ["Scheduled", "Estimated"],
  allowedDates,
  blockedAirports: config.blocklist?.airports || []
});
printCounts("After filterFr24Rows", perOriginCounts(filteredRows, defaultOrigin));

// Breakdown: what did filterFr24Rows drop and why?
console.log(`\n  Drop analysis (per row in rawRows not in filteredRows):`);
const dropReasons = {};
const blockedAirportsSet = new Set((config.blocklist?.airports || []).map((x) => String(x).toUpperCase()));
const allowedDatesSet = new Set(allowedDates);
const allowedStatusesSet = new Set(["Scheduled", "Estimated"]);

for (const row of rawRows) {
  const origin = String(row.originAirport || defaultOrigin).toUpperCase();
  const statusText = String(row.status || "");
  const statusType = statusText.startsWith("Estimated") ? "Estimated" : statusText;
  const statusOk = allowedStatusesSet.has(statusType);
  const airportOk = row.destinationIata && !blockedAirportsSet.has(String(row.destinationIata).toUpperCase());
  const dateOk = allowedDatesSet.size === 0 || allowedDatesSet.has(row.flightDate);

  if (statusOk && airportOk && dateOk) continue; // passes filter

  const reasons = [];
  if (!statusOk) reasons.push(`status="${statusType}"`);
  if (!airportOk) {
    if (!row.destinationIata) {
      reasons.push("dest=EMPTY");
    } else {
      reasons.push(`dest_blocked=${row.destinationIata}`);
    }
  }
  if (!dateOk) reasons.push(`date_out=${row.flightDate}`);

  const reasonKey = reasons.join("+");
  if (!dropReasons[origin]) dropReasons[origin] = {};
  dropReasons[origin][reasonKey] = (dropReasons[origin][reasonKey] || 0) + 1;
}

for (const [origin, reasons] of Object.entries(dropReasons).sort()) {
  console.log(`    ${origin}:`);
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${reason}: ${count}`);
  }
}

// --- STAGE 2b: origin scoping (as dashboard-runner does) ---
console.log(`\n--- STAGE 2b: Origin scoping ---`);
const runOriginSet = new Set(config.originAirports.map((x) => x.toUpperCase()));
const scopedRows = filteredRows.filter((row) => {
  const rowOrigin = String(row.originAirport || defaultOrigin).trim().toUpperCase();
  return rowOrigin && runOriginSet.has(rowOrigin);
});
printCounts("After origin scoping", perOriginCounts(scopedRows, defaultOrigin));

// --- STAGE 3: cargo filter ---
console.log(`\n--- STAGE 3: Cargo operator filter ---`);
const nonCargoRows = scopedRows.filter((row) => !isCargoOperator(row.airline));
printCounts("After cargo filter", perOriginCounts(nonCargoRows, defaultOrigin));

const cargoDropped = scopedRows.length - nonCargoRows.length;
if (cargoDropped > 0) {
  console.log(`  (Dropped ${cargoDropped} cargo rows)`);
}

// --- STAGE 4: isDepartureTooSoon ---
console.log(`\n--- STAGE 4: isDepartureTooSoon filter (< 30 min from now) ---`);
const nowMs = Date.now();
const survivingRows = [];
const tooSoonDrops = {};
let tooSoonTotal = 0;

for (const row of nonCargoRows) {
  const origin = String(row.originAirport || defaultOrigin).toUpperCase();
  const depIso = row.departureLocalIso;

  let tooSoon = true;
  let diffMinutes = null;
  if (depIso) {
    const depUtc = new Date(depIso + "+04:00");
    if (!Number.isNaN(depUtc.getTime())) {
      diffMinutes = (depUtc.getTime() - nowMs) / 60000;
      tooSoon = diffMinutes < 30;
    }
  }

  if (tooSoon) {
    tooSoonTotal += 1;
    if (!tooSoonDrops[origin]) tooSoonDrops[origin] = { count: 0, samples: [] };
    tooSoonDrops[origin].count += 1;
    if (tooSoonDrops[origin].samples.length < 3) {
      tooSoonDrops[origin].samples.push({
        flight: row.flight,
        dest: row.destinationIata,
        depIso: depIso || "(none)",
        diffMin: diffMinutes !== null ? diffMinutes.toFixed(1) : "N/A"
      });
    }
  } else {
    survivingRows.push(row);
  }
}

printCounts("After isDepartureTooSoon", perOriginCounts(survivingRows, defaultOrigin));

if (tooSoonTotal > 0) {
  console.log(`\n  Too-soon drops (${tooSoonTotal} total):`);
  for (const [origin, info] of Object.entries(tooSoonDrops).sort()) {
    console.log(`    ${origin}: ${info.count} dropped`);
    for (const s of info.samples) {
      console.log(`      sample: ${s.flight} -> ${s.dest}  dep=${s.depIso}  diff=${s.diffMin} min`);
    }
  }
}

// --- FINAL SUMMARY ---
console.log(`\n========== PIPELINE SUMMARY ==========`);
console.log(`Stage 1 (loadFr24Data):      ${rawRows.length} rows`);
printCounts("                            ", perOriginCounts(rawRows, defaultOrigin));
console.log(`Stage 2 (filterFr24Rows):    ${filteredRows.length} rows`);
printCounts("                            ", perOriginCounts(filteredRows, defaultOrigin));
console.log(`Stage 2b (origin scoping):   ${scopedRows.length} rows`);
printCounts("                            ", perOriginCounts(scopedRows, defaultOrigin));
console.log(`Stage 3 (cargo filter):      ${nonCargoRows.length} rows`);
printCounts("                            ", perOriginCounts(nonCargoRows, defaultOrigin));
console.log(`Stage 4 (departureTooSoon):  ${survivingRows.length} rows`);
printCounts("                            ", perOriginCounts(survivingRows, defaultOrigin));
console.log(`\nDrop breakdown:`);
console.log(`  filterFr24Rows dropped:    ${rawRows.length - filteredRows.length}`);
console.log(`  origin scoping dropped:    ${filteredRows.length - scopedRows.length}`);
console.log(`  cargo filter dropped:      ${scopedRows.length - nonCargoRows.length}`);
console.log(`  departureTooSoon dropped:  ${nonCargoRows.length - survivingRows.length}`);
console.log(`  TOTAL surviving:           ${survivingRows.length}`);
