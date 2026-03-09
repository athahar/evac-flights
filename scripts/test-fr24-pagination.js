#!/usr/bin/env node

/**
 * Test FR24 API pagination strategies to get more than 20 results.
 *
 * Strategy 1: Time-window batching (split day into smaller windows)
 * Strategy 2: offset param
 * Strategy 3: cursor param
 */

import "dotenv/config";

const API_KEY = process.env.FLIGHT_RADAR_API_KEY || "";
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Accept-Version": "v1"
};

async function fetchFlights(label, params) {
  const url = `https://fr24api.flightradar24.com/api/flight-summary/full?${params}`;
  console.log(`\n── ${label} ──`);
  console.log(`  ${url}`);

  const res = await fetch(url, { headers });
  const credits = res.headers.get("x-fr24-credits-consumed") || "?";
  const remaining = res.headers.get("x-fr24-credits-remaining") || "?";

  if (!res.ok) {
    const text = await res.text();
    console.log(`  ❌ HTTP ${res.status}: ${text.slice(0, 200)}`);
    console.log(`  Credits: ${credits} consumed, ${remaining} remaining`);
    return [];
  }

  const json = await res.json();
  const flights = json.data || [];

  if (flights.length > 0) {
    const first = flights[0];
    const last = flights[flights.length - 1];
    console.log(`  ✓ ${flights.length} flights (${first?.flight} → ${last?.flight})`);
    console.log(`    First takeoff: ${first?.datetime_takeoff}`);
    console.log(`    Last takeoff:  ${last?.datetime_takeoff}`);
  } else {
    console.log(`  ✓ 0 flights`);
  }
  console.log(`  Credits: ${credits} consumed, ${remaining} remaining`);
  return flights;
}

// ── Strategy 1: Time-window batching ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  Strategy 1: Time-window batching (${DATE})`);
console.log(`══════════════════════════════════════════════`);

const allFlights = new Map();
const timeWindows = [
  ["00:00:00", "03:59:59"],
  ["04:00:00", "07:59:59"],
  ["08:00:00", "11:59:59"],
  ["12:00:00", "15:59:59"],
  ["16:00:00", "19:59:59"],
  ["20:00:00", "23:59:59"]
];

for (const [from, to] of timeWindows) {
  const params = `airports=DXB&type=outbound&flight_datetime_from=${DATE}T${from}&flight_datetime_to=${DATE}T${to}`;
  const flights = await fetchFlights(`${from}–${to}`, params);
  for (const f of flights) {
    allFlights.set(f.fr24_id, f);
  }
}

console.log(`\n── Time-window results ──`);
console.log(`  Total unique flights: ${allFlights.size}`);

// ── Strategy 2: offset param ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  Strategy 2: offset parameter`);
console.log(`══════════════════════════════════════════════`);

await fetchFlights("offset=0", `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&offset=0`);
await fetchFlights("offset=20", `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&offset=20`);
await fetchFlights("offset=40", `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&offset=40`);

// ── Strategy 3: cursor param ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  Strategy 3: cursor/after param`);
console.log(`══════════════════════════════════════════════`);

// Try using the last fr24_id as a cursor
const baseFlights = await fetchFlights("base request", `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59`);
if (baseFlights.length > 0) {
  const lastId = baseFlights[baseFlights.length - 1].fr24_id;
  await fetchFlights(`after=${lastId}`, `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&after=${lastId}`);
  await fetchFlights(`cursor=${lastId}`, `airports=DXB&type=outbound&flight_datetime_from=${DATE}T00:00:00&flight_datetime_to=${DATE}T23:59:59&cursor=${lastId}`);
}

// ── Final assessment ──
console.log(`\n══════════════════════════════════════════════`);
console.log(`  FINAL COUNT`);
console.log(`══════════════════════════════════════════════`);
console.log(`  Time-window batching: ${allFlights.size} unique flights`);

// Show dest distribution
const destCounts = {};
for (const f of allFlights.values()) {
  const dest = f.dest_iata || f.dest_icao || "?";
  destCounts[dest] = (destCounts[dest] || 0) + 1;
}
const destEntries = Object.entries(destCounts).sort((a, b) => b[1] - a[1]);
console.log(`  Destinations: ${destEntries.length}`);
console.log(`  Top 15: ${destEntries.slice(0, 15).map(([d, c]) => `${d}(${c})`).join(", ")}`);

// Show airline distribution
const airlineCounts = {};
for (const f of allFlights.values()) {
  const airline = f.operating_as || f.painted_as || "?";
  airlineCounts[airline] = (airlineCounts[airline] || 0) + 1;
}
const airlineEntries = Object.entries(airlineCounts).sort((a, b) => b[1] - a[1]);
console.log(`  Airlines: ${airlineEntries.length}`);
console.log(`  Top 15: ${airlineEntries.slice(0, 15).map(([a, c]) => `${a}(${c})`).join(", ")}`);

// Category breakdown
const catCounts = {};
for (const f of allFlights.values()) {
  const cat = f.category || "unknown";
  catCounts[cat] = (catCounts[cat] || 0) + 1;
}
console.log(`  Categories: ${JSON.stringify(catCounts)}`);
