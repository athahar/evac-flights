#!/usr/bin/env node

/**
 * Quick FR24 API validation script.
 *
 * Usage:
 *   node scripts/test-fr24-search.js [AIRPORT] [DEST_FILTER] [DATE_OFFSET]
 *
 * Examples:
 *   node scripts/test-fr24-search.js              # DXB departures today, all destinations
 *   node scripts/test-fr24-search.js DXB BOM      # DXB departures filtered to BOM
 *   node scripts/test-fr24-search.js DXB "" +1     # DXB departures tomorrow (scheduled flights)
 *   node scripts/test-fr24-search.js MCT BOM +1   # MCT departures tomorrow filtered to BOM
 */

import "dotenv/config";

const API_KEY = process.env.FLIGHT_RADAR_API_KEY || "";
const AIRPORT = (process.argv[2] || "DXB").toUpperCase();
const DEST_FILTER = (process.argv[3] || "").toUpperCase();
const DATE_OFFSET = parseInt(process.argv[4] || "0", 10) || 0;

if (!API_KEY) {
  console.error("Missing FLIGHT_RADAR_API_KEY in .env");
  process.exit(1);
}

// ── ICAO airline code → readable name mapping ──
const ICAO_AIRLINES = {
  UAE: "Emirates", ETD: "Etihad Airways", FDB: "flydubai", ABY: "Air Arabia",
  QTR: "Qatar Airways", SVA: "Saudia", GFA: "Gulf Air", OMA: "Oman Air",
  KAC: "Kuwait Airways", MEA: "Middle East Airlines", RJA: "Royal Jordanian",
  MSR: "EgyptAir", THY: "Turkish Airlines", PIA: "PIA", AIC: "Air India",
  IGO: "IndiGo", SEJ: "SpiceJet", UAL: "United Airlines", BAW: "British Airways",
  DLH: "Lufthansa", AFR: "Air France", KLM: "KLM", SIA: "Singapore Airlines",
  CPA: "Cathay Pacific", MAS: "Malaysia Airlines", THA: "Thai Airways",
  JAL: "Japan Airlines", ANA: "All Nippon Airways", CCA: "Air China",
  CES: "China Eastern", CSN: "China Southern", ETH: "Ethiopian Airlines",
  KQA: "Kenya Airways", SAA: "South African Airways", RAM: "Royal Air Maroc",
  WZZ: "Wizz Air", RYR: "Ryanair", EZY: "easyJet", SWR: "Swiss",
  AUA: "Austrian Airlines", TAP: "TAP Portugal", IBE: "Iberia",
  VTI: "Vistara", AXB: "Air India Express", SQC: "Singapore Cargo",
  CLX: "Cargolux", FDX: "FedEx", UPS: "UPS Airlines", GTI: "Atlas Air",
  DAL: "Delta", AAL: "American Airlines", WJA: "WestJet", PAL: "Philippine Airlines",
  KAL: "Korean Air", AAR: "Asiana Airlines", EVA: "EVA Air",
  CAL: "China Airlines", JST: "Jetstar", QFA: "Qantas",
};

// Date in Dubai timezone (UTC+4), with optional offset
function getDubaiDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now); // YYYY-MM-DD
}

const DATE = getDubaiDate(DATE_OFFSET);
const LIMIT = 2000; // FR24 supports up to 20,000

// Try both light and full to compare
const ENDPOINTS = [
  {
    name: "flight-summary/light",
    url: `https://fr24api.flightradar24.com/api/flight-summary/light?airports.iata=${AIRPORT}&flights.datetime.type=departure&flights.datetime.from=${DATE}T00:00:00&flights.datetime.to=${DATE}T23:59:59&limit=${LIMIT}`
  },
  {
    name: "flight-summary/full",
    url: `https://fr24api.flightradar24.com/api/flight-summary/full?airports.iata=${AIRPORT}&flights.datetime.type=departure&flights.datetime.from=${DATE}T00:00:00&flights.datetime.to=${DATE}T23:59:59&limit=${LIMIT}`
  },
  {
    name: "flight-summary/light (old params)",
    url: `https://fr24api.flightradar24.com/api/flight-summary/light?airports=${AIRPORT}&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&limit=${LIMIT}`
  }
];

console.log(`\n══════════════════════════════════════════════`);
console.log(`  FR24 API Search Validation`);
console.log(`══════════════════════════════════════════════`);
console.log(`Airport:     ${AIRPORT}`);
console.log(`Date:        ${DATE} (offset: ${DATE_OFFSET >= 0 ? "+" : ""}${DATE_OFFSET} days)`);
console.log(`Filter:      ${DEST_FILTER || "(all destinations)"}`);
console.log(`Limit:       ${LIMIT}`);
console.log(`API Key:     ${API_KEY.slice(0, 12)}...`);
console.log(`══════════════════════════════════════════════\n`);

// ── Fetch helper ──
async function fetchEndpoint(endpoint) {
  console.log(`\n── Testing: ${endpoint.name} ──────────────────`);
  console.log(`URL: ${endpoint.url}\n`);

  const res = await fetch(endpoint.url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
      "Accept-Version": "v1"
    }
  });

  // Show rate-limit headers
  const rateLimitHeaders = {};
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase().includes("ratelimit") || key.toLowerCase().includes("x-fr24") || key.toLowerCase().includes("x-credits")) {
      rateLimitHeaders[key] = value;
    }
  }
  if (Object.keys(rateLimitHeaders).length > 0) {
    console.log("Rate-limit headers:", JSON.stringify(rateLimitHeaders, null, 2));
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ HTTP ${res.status}: ${text.slice(0, 300)}`);
    return null;
  }

  const json = await res.json();

  // Show top-level response keys
  console.log(`Response keys: ${Object.keys(json).join(", ")}`);

  const flights = Array.isArray(json.data) ? json.data : [];
  console.log(`Flights returned: ${flights.length}`);

  // Check for pagination info
  if (json.page) console.log(`Pagination:`, JSON.stringify(json.page));
  if (json.total) console.log(`Total available: ${json.total}`);
  if (json.meta) console.log(`Meta:`, JSON.stringify(json.meta));

  return { name: endpoint.name, flights, json };
}

// ── Extract fields from the ACTUAL flat response shape ──
function extract(f) {
  // The API returns flat objects like:
  // { fr24_id, flight, callsign, operating_as, painted_as, type, reg,
  //   orig_icao, orig_iata, dest_icao, dest_iata,
  //   datetime_takeoff, datetime_landed, flight_ended, ... }

  const flightNumber = f?.flight || f?.callsign || "";
  const destIata = (f?.dest_iata || "").toUpperCase();
  const origIata = (f?.orig_iata || "").toUpperCase();

  // Derive airline name from ICAO code
  const operatingAs = f?.operating_as || f?.painted_as || "";
  const airlineName = ICAO_AIRLINES[operatingAs] || operatingAs;

  // Times
  const takeoff = f?.datetime_takeoff || "";
  const landed = f?.datetime_landed || "";
  const flightEnded = f?.flight_ended;

  // Aircraft ICAO type code
  const aircraftType = f?.type || "";

  // Registration
  const reg = f?.reg || "";

  // Also check for nested shapes (in case API changes)
  const nestedFlight = f?.flight?.number?.iata || "";
  const nestedDest = f?.destination?.iata || "";
  const nestedAirline = f?.airline?.name || "";
  const nestedDepScheduled = f?.departure?.scheduled || "";
  const nestedStatus = f?.status?.text || (typeof f?.status === "string" ? f?.status : "");

  return {
    flight: nestedFlight || String(flightNumber).trim(),
    dest: nestedDest || destIata,
    orig: origIata,
    airline: nestedAirline || airlineName,
    depTime: nestedDepScheduled || takeoff,
    arrTime: landed,
    flightEnded: flightEnded,
    status: nestedStatus || (flightEnded === true ? "Landed" : flightEnded === false ? "Scheduled/Active" : ""),
    aircraft: aircraftType,
    reg: reg,
    operatingAs: operatingAs,
    // Raw for inspection
    _raw: f
  };
}

// ── Run all endpoints ──
let bestResult = null;

for (const endpoint of ENDPOINTS) {
  const result = await fetchEndpoint(endpoint);
  if (!result) continue;

  const { flights } = result;

  if (flights.length === 0) {
    console.log("  (no flights returned)\n");
    continue;
  }

  // Show raw shape of first flight
  console.log(`\n── Raw shape (first flight) ──`);
  console.log(JSON.stringify(flights[0], null, 2));

  // Also show a flight that hasn't ended yet (if any)
  const activeFlights = flights.filter(f => f?.flight_ended === false);
  if (activeFlights.length > 0) {
    console.log(`\n── Raw shape (active/scheduled flight) ──`);
    console.log(JSON.stringify(activeFlights[0], null, 2));
  }
  console.log();

  // Keep the best result (most flights)
  if (!bestResult || flights.length > bestResult.flights.length) {
    bestResult = result;
  }
}

if (!bestResult || bestResult.flights.length === 0) {
  console.log("\n❌ No flights returned from any endpoint. Check API key and parameters.");
  process.exit(1);
}

// ── Analyze the best result ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  Analysis (best result: ${bestResult.name})`);
console.log(`  ${bestResult.flights.length} flights`);
console.log(`══════════════════════════════════════════════\n`);

const extracted = bestResult.flights.map(extract);

// ── Flight status breakdown ──
const statusCounts = {};
for (const f of extracted) {
  const s = f.status || "(unknown)";
  statusCounts[s] = (statusCounts[s] || 0) + 1;
}

const endedCounts = { ended: 0, active: 0, unknown: 0 };
for (const f of bestResult.flights) {
  if (f.flight_ended === true) endedCounts.ended++;
  else if (f.flight_ended === false) endedCounts.active++;
  else endedCounts.unknown++;
}

// ── Summary ──
const destinations = new Set(extracted.map(f => f.dest).filter(Boolean));
const airlines = new Set(extracted.map(f => f.airline).filter(Boolean));
const aircraftTypes = new Set(extracted.map(f => f.aircraft).filter(Boolean));

console.log(`── Summary ──────────────────────────────────`);
console.log(`Flights:       ${extracted.length}`);
console.log(`Destinations:  ${destinations.size}`);
console.log(`Airlines:      ${airlines.size}`);
console.log(`Aircraft types:${aircraftTypes.size}`);
console.log(`Flight status: ${JSON.stringify(endedCounts)}`);
console.log(`Status values: ${JSON.stringify(statusCounts)}`);
console.log(`──────────────────────────────────────────────\n`);

// ── Field coverage ──
const has = {
  flight: extracted.filter(f => f.flight).length,
  dest: extracted.filter(f => f.dest).length,
  orig: extracted.filter(f => f.orig).length,
  airline: extracted.filter(f => f.airline).length,
  depTime: extracted.filter(f => f.depTime).length,
  arrTime: extracted.filter(f => f.arrTime).length,
  status: extracted.filter(f => f.status).length,
  aircraft: extracted.filter(f => f.aircraft).length,
  reg: extracted.filter(f => f.reg).length
};

console.log(`── Field Coverage ───────────────────────────`);
for (const [key, count] of Object.entries(has)) {
  const pct = extracted.length > 0 ? ((count / extracted.length) * 100).toFixed(0) : 0;
  console.log(`  ${key.padEnd(14)} ${count}/${extracted.length} (${pct}%)`);
}
console.log(`──────────────────────────────────────────────\n`);

// ── Unique all top-level keys across all flights ──
const allKeys = new Set();
for (const f of bestResult.flights) {
  for (const key of Object.keys(f)) {
    allKeys.add(key);
  }
}
console.log(`── All response keys ────────────────────────`);
console.log(`  ${[...allKeys].sort().join(", ")}`);
console.log(`──────────────────────────────────────────────\n`);

// ── Filtered flights ──
const filtered = DEST_FILTER
  ? extracted.filter(f => f.dest === DEST_FILTER)
  : extracted.slice(0, 30);

const label = DEST_FILTER
  ? `Flights to ${DEST_FILTER}`
  : `First 30 flights`;

console.log(`── ${label} ──`);
if (filtered.length === 0) {
  console.log("  (none found)");
} else {
  // Header
  console.log(`  ${"FLIGHT".padEnd(10)} ${"AIRLINE".padEnd(22)} ${"ORIG".padEnd(5)} ${"DEST".padEnd(5)} ${"DEPARTURE".padEnd(22)} ${"ARRIVAL".padEnd(22)} ${"STATUS".padEnd(16)} ${"ACFT".padEnd(6)} ${"REG"}`);
  console.log(`  ${"─".repeat(10)} ${"─".repeat(22)} ${"─".repeat(5)} ${"─".repeat(5)} ${"─".repeat(22)} ${"─".repeat(22)} ${"─".repeat(16)} ${"─".repeat(6)} ${"─".repeat(8)}`);

  for (const f of filtered) {
    const dep = f.depTime || "—";
    const arr = f.arrTime || "—";
    console.log(
      `  ${(f.flight || "???").padEnd(10)} ${f.airline.padEnd(22)} ${f.orig.padEnd(5)} ${f.dest.padEnd(5)} ${dep.padEnd(22)} ${arr.padEnd(22)} ${(f.status || "").padEnd(16)} ${f.aircraft.padEnd(6)} ${f.reg}`
    );
  }
}
console.log(`\nTotal matching: ${filtered.length}`);

// ── Unique airlines list ──
console.log(`\n── All Airlines ──────────────────────────────`);
const sorted = [...airlines].sort();
for (const a of sorted) {
  const count = extracted.filter(f => f.airline === a).length;
  console.log(`  ${a.padEnd(30)} ${count} flights`);
}

// ── Unique destinations ──
console.log(`\n── All Destinations (${destinations.size}) ──────────────`);
const sortedDests = [...destinations].sort();
for (let i = 0; i < sortedDests.length; i += 10) {
  console.log(`  ${sortedDests.slice(i, i + 10).join(", ")}`);
}

// ── Key assessment for search use case ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  ASSESSMENT FOR SEARCH USE CASE`);
console.log(`══════════════════════════════════════════════`);

const hasScheduled = endedCounts.active > 0;
const hasTakeoff = has.depTime > 0;
const hasLanding = has.arrTime > 0;
const hasAirline = has.airline > 0;
const hasAircraft = has.aircraft > 0;
const totalFlights = extracted.length;

console.log(`✓ Total flights:      ${totalFlights} (${totalFlights > 100 ? "GOOD" : totalFlights > 0 ? "LOW - may need different params" : "NONE"})`);
console.log(`${hasScheduled ? "✓" : "✗"} Scheduled flights:  ${endedCounts.active} of ${totalFlights} (${hasScheduled ? "FR24 has future flights" : "Only departed flights - try +1 offset"})`);
console.log(`${hasTakeoff ? "✓" : "✗"} Departure times:    ${has.depTime}/${totalFlights}`);
console.log(`${hasLanding ? "✓" : "✗"} Arrival times:      ${has.arrTime}/${totalFlights}`);
console.log(`${hasAirline ? "✓" : "✗"} Airline names:      ${has.airline}/${totalFlights} (mapped from ICAO codes)`);
console.log(`${hasAircraft ? "✓" : "✗"} Aircraft types:     ${has.aircraft}/${totalFlights} (ICAO codes like B38M)`);
console.log(`${has.reg > 0 ? "✓" : "✗"} Registrations:      ${has.reg}/${totalFlights}`);
console.log(`\nNote: FR24 uses ICAO airline codes (UAE, QTR) not IATA (EK, QR).`);
console.log(`      Aircraft types are ICAO codes (B38M) not names (Boeing 737 MAX 8).`);
console.log(`      No scheduled departure times - only actual takeoff/landing times.`);
console.log(`══════════════════════════════════════════════\n`);
