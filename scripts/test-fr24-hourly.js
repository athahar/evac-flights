#!/usr/bin/env node

/**
 * Test FR24 API with hourly time windows to bypass 20-result cap.
 * Also fixes the outbound filter issue (DXB appearing as destination).
 */

import "dotenv/config";

const API_KEY = process.env.FLIGHT_RADAR_API_KEY || "";
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Accept-Version": "v1"
};

const allFlights = new Map();
let totalCredits = 0;
let totalRequests = 0;

// Generate 1-hour windows for the day (up to current hour)
const now = new Date();
const dubaiHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", hour: "numeric", hour12: false }).format(now));

console.log(`\n══════════════════════════════════════════════`);
console.log(`  FR24 Hourly Time-Window Scan`);
console.log(`  Date: ${DATE}  Dubai hour: ${dubaiHour}:xx`);
console.log(`══════════════════════════════════════════════\n`);

// Scan hours 0 through current hour (no point scanning future hours)
for (let hour = 0; hour <= Math.min(dubaiHour, 23); hour++) {
  const from = `${DATE}T${String(hour).padStart(2, "0")}:00:00`;
  const to = `${DATE}T${String(hour).padStart(2, "0")}:59:59`;
  const url = `https://fr24api.flightradar24.com/api/flight-summary/full?airports=DXB&type=outbound&flight_datetime_from=${from}&flight_datetime_to=${to}`;

  const res = await fetch(url, { headers });
  totalRequests++;

  const credits = parseInt(res.headers.get("x-fr24-credits-consumed") || "0");
  totalCredits += credits;

  if (!res.ok) {
    const status = res.status;
    if (status === 429) {
      console.log(`  ${String(hour).padStart(2, "0")}:00 ⚠️  RATE LIMITED — waiting 15s...`);
      await new Promise(r => setTimeout(r, 15000));
      // Retry
      const retryRes = await fetch(url, { headers });
      totalRequests++;
      if (retryRes.ok) {
        const json = await retryRes.json();
        const flights = json.data || [];
        for (const f of flights) allFlights.set(f.fr24_id, f);
        console.log(`  ${String(hour).padStart(2, "0")}:00 ✓  ${flights.length} flights (retry)`);
      }
    } else {
      console.log(`  ${String(hour).padStart(2, "0")}:00 ❌ HTTP ${status}`);
    }
    continue;
  }

  const json = await res.json();
  const flights = json.data || [];
  const newCount = flights.filter(f => !allFlights.has(f.fr24_id)).length;
  for (const f of flights) allFlights.set(f.fr24_id, f);

  const capWarning = flights.length === 20 ? " ⚠️ HIT CAP" : "";
  console.log(`  ${String(hour).padStart(2, "0")}:00  ${String(flights.length).padStart(3)} flights (+${newCount} new)${capWarning}`);

  // Rate limit: ~10 req/min, so wait 7 seconds between requests
  await new Promise(r => setTimeout(r, 7000));
}

// ── Analysis ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  RESULTS`);
console.log(`══════════════════════════════════════════════`);
console.log(`  Total requests:  ${totalRequests}`);
console.log(`  Total credits:   ${totalCredits}`);
console.log(`  Unique flights:  ${allFlights.size}`);

// Filter to TRUE outbound (orig_iata === "DXB")
const outbound = [...allFlights.values()].filter(f => (f.orig_iata || "").toUpperCase() === "DXB");
const inbound = [...allFlights.values()].filter(f => (f.dest_iata || "").toUpperCase() === "DXB");

console.log(`  Outbound (DXB→):  ${outbound.length}`);
console.log(`  Inbound (→DXB):   ${inbound.length}`);

// ── Outbound destinations ──
const destCounts = {};
for (const f of outbound) {
  const dest = f.dest_iata || "?";
  destCounts[dest] = (destCounts[dest] || 0) + 1;
}
const destEntries = Object.entries(destCounts).sort((a, b) => b[1] - a[1]);

console.log(`\n── Outbound Destinations (${destEntries.length}) ──────────`);
for (const [dest, count] of destEntries) {
  console.log(`  ${dest.padEnd(5)} ${count}`);
}

// ── Outbound airlines ──
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
  WZZ: "Wizz Air", RYR: "Ryanair", AFL: "Aeroflot", SWR: "Swiss",
  TVS: "Smartwings", QSC: "Smartwings", BRU: "Belavia", CYP: "Cyprus Airways",
  SIF: "Sifi Airways", UZB: "Uzbekistan Airways", AFG: "Ariana Afghan", UBG: "US-Bangla",
};

const airlineCounts = {};
for (const f of outbound) {
  const icao = f.operating_as || f.painted_as || "?";
  const name = ICAO_AIRLINES[icao] || icao;
  airlineCounts[name] = (airlineCounts[name] || 0) + 1;
}
const airlineEntries = Object.entries(airlineCounts).sort((a, b) => b[1] - a[1]);

console.log(`\n── Outbound Airlines (${airlineEntries.length}) ──────────`);
for (const [airline, count] of airlineEntries) {
  console.log(`  ${airline.padEnd(25)} ${count}`);
}

// ── BOM flights specifically ──
const bomFlights = outbound.filter(f => (f.dest_iata || "").toUpperCase() === "BOM");
console.log(`\n── DXB → BOM flights (${bomFlights.length}) ──────────`);
for (const f of bomFlights) {
  const icao = f.operating_as || f.painted_as || "?";
  const airline = ICAO_AIRLINES[icao] || icao;
  console.log(`  ${f.flight?.padEnd(10)} ${airline.padEnd(20)} takeoff: ${f.datetime_takeoff || "—"}  landed: ${f.datetime_landed || "—"}  aircraft: ${f.type}  reg: ${f.reg}`);
}

// ── Key finding: is the data useful for search? ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  SEARCH USE-CASE ASSESSMENT`);
console.log(`══════════════════════════════════════════════`);
console.log(`  Total outbound flights found: ${outbound.length}`);
console.log(`  Unique destinations: ${destEntries.length}`);
console.log(`  Unique airlines: ${airlineEntries.length}`);
console.log(`  `);
console.log(`  ✗ NO future flight support (API rejects tomorrow's date)`);
console.log(`  ✗ NO scheduled departure times (only actual takeoff)`);
console.log(`  ✗ 20-result cap per request (need hourly batching)`);
console.log(`  ✓ IATA codes available (full endpoint)`);
console.log(`  ✓ Aircraft type, registration, category`);
console.log(`  ✓ Can be used to verify flights that operated today`);
console.log(`  `);
console.log(`  Recommendation: Use FR24 as VERIFICATION layer, not schedule source.`);
console.log(`  - Duffel: primary search (pricing + availability)`);
console.log(`  - FR24: "this flight operated today" verification badge`);
console.log(`  - Yesterday's FR24 data: approximate schedule reference`);
console.log(`══════════════════════════════════════════════\n`);
