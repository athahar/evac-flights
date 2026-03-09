#!/usr/bin/env node

/**
 * Test FR24 count endpoint + pagination + tomorrow's date
 */

import "dotenv/config";

const API_KEY = process.env.FLIGHT_RADAR_API_KEY || "";
const DATE_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const DATE_TOMORROW = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Accept-Version": "v1"
};

function showHeaders(res) {
  for (const [key, value] of res.headers.entries()) {
    if (key.includes("credit") || key.includes("fr24") || key.includes("ratelimit")) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

// ── Test 1: Count endpoint ──
console.log(`\n═══ Test 1: Count endpoint (today: ${DATE_TODAY}) ═══`);
{
  const url = `https://fr24api.flightradar24.com/api/flight-summary/count?airports=DXB&type=outbound&flight_datetime_from=${DATE_TODAY}T00:00:00&flight_datetime_to=${DATE_TODAY}T23:59:59`;
  console.log(`URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (res.ok) {
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } else {
    console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  showHeaders(res);
}

// ── Test 2: Tomorrow's flights ──
console.log(`\n═══ Test 2: Tomorrow (${DATE_TOMORROW}) - looking for scheduled flights ═══`);
{
  const url = `https://fr24api.flightradar24.com/api/flight-summary/light?airports=DXB&type=outbound&flight_datetime_from=${DATE_TOMORROW}T00:00:00&flight_datetime_to=${DATE_TOMORROW}T23:59:59`;
  console.log(`URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (res.ok) {
    const data = await res.json();
    const flights = data.data || [];
    console.log(`Flights returned: ${flights.length}`);
    showHeaders(res);
    if (flights.length > 0) {
      console.log("\nFirst flight:", JSON.stringify(flights[0], null, 2));
      const ended = flights.filter(f => f.flight_ended === true).length;
      const active = flights.filter(f => f.flight_ended === false).length;
      console.log(`\nEnded: ${ended}, Active/Scheduled: ${active}`);
    } else {
      console.log("(no flights — FR24 only has tracked/departed flights, not future schedules)");
    }
  } else {
    console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    showHeaders(res);
  }
}

// ── Test 3: Try page param ──
console.log(`\n═══ Test 3: Pagination - page=2 (today) ═══`);
{
  const url = `https://fr24api.flightradar24.com/api/flight-summary/light?airports=DXB&type=outbound&flight_datetime_from=${DATE_TODAY}T00:00:00&flight_datetime_to=${DATE_TODAY}T23:59:59&page=2`;
  console.log(`URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (res.ok) {
    const data = await res.json();
    const flights = data.data || [];
    console.log(`Flights on page 2: ${flights.length}`);
    showHeaders(res);
    if (flights.length > 0) {
      console.log("First flight:", flights[0]?.flight, "takeoff:", flights[0]?.datetime_takeoff);
    }
  } else {
    console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    showHeaders(res);
  }
}

// ── Test 4: Try different limit values ──
console.log(`\n═══ Test 4: limit=100 (today) ═══`);
{
  const url = `https://fr24api.flightradar24.com/api/flight-summary/light?airports=DXB&type=outbound&flight_datetime_from=${DATE_TODAY}T00:00:00&flight_datetime_to=${DATE_TODAY}T23:59:59&limit=100`;
  console.log(`URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (res.ok) {
    const data = await res.json();
    const flights = data.data || [];
    console.log(`Flights with limit=100: ${flights.length}`);
    showHeaders(res);
    if (flights.length > 20) {
      console.log("✓ PAGINATION WORKS — got more than 20 results!");
      console.log(`Last flight: ${flights[flights.length - 1]?.flight} takeoff: ${flights[flights.length - 1]?.datetime_takeoff}`);
    } else {
      console.log("Same 20 results — limit param may not work as expected");
    }
  } else {
    console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    showHeaders(res);
  }
}

// ── Test 5: Try the full endpoint with limit ──
console.log(`\n═══ Test 5: full endpoint + limit=100 ═══`);
{
  const url = `https://fr24api.flightradar24.com/api/flight-summary/full?airports=DXB&type=outbound&flight_datetime_from=${DATE_TODAY}T00:00:00&flight_datetime_to=${DATE_TODAY}T23:59:59&limit=100`;
  console.log(`URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (res.ok) {
    const data = await res.json();
    const flights = data.data || [];
    console.log(`Flights returned: ${flights.length}`);
    showHeaders(res);
    if (flights.length > 0 && flights.length !== 20) {
      console.log("✓ Different count than light endpoint!");
    }
    // Check if full has more fields
    if (flights.length > 0) {
      const keys = Object.keys(flights[0]).sort();
      console.log(`Fields: ${keys.join(", ")}`);
      // Show any fields not in light
      const lightKeys = ["callsign", "datetime_landed", "datetime_takeoff", "dest_icao", "dest_icao_actual", "first_seen", "flight", "flight_ended", "fr24_id", "hex", "last_seen", "operating_as", "orig_icao", "painted_as", "reg", "type"];
      const extraKeys = keys.filter(k => !lightKeys.includes(k));
      if (extraKeys.length > 0) {
        console.log(`\n✓ Extra fields in full: ${extraKeys.join(", ")}`);
        for (const k of extraKeys) {
          console.log(`  ${k}: ${JSON.stringify(flights[0][k])}`);
        }
      }
    }
  } else {
    console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    showHeaders(res);
  }
}

console.log(`\n═══ Credits Summary ═══`);
{
  // One final dummy call to check remaining credits
  const url = `https://fr24api.flightradar24.com/api/flight-summary/count?airports=DXB&type=outbound&flight_datetime_from=${DATE_TODAY}T00:00:00&flight_datetime_to=${DATE_TODAY}T23:59:59`;
  const res = await fetch(url, { headers });
  showHeaders(res);
}
