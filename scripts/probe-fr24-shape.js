import dotenv from "dotenv";
import { loadConfig } from "../lib/config.js";
import { getDateRangeIso } from "../lib/fr24.js";

dotenv.config();

const config = loadConfig(process.env);
const timezone = config.dashboardTimezone || "Asia/Dubai";
const allowedDates = getDateRangeIso(timezone, config.dashboardLookaheadDays);
const airport = config.originAirports[0] || "DXB";
const dateIso = allowedDates[0];

const defaultTemplate = "https://fr24api.flightradar24.com/api/flight-summary/light?airports={AIRPORT}&type=outbound&flight_datetime_from={DATE}T00:00:00&flight_datetime_to={DATE}T23:59:59";
const template = String(config.fr24ApiUrlTemplate || "").trim() || defaultTemplate;
const url = template
  .replaceAll("{AIRPORT}", encodeURIComponent(airport))
  .replaceAll("{DATE}", encodeURIComponent(dateIso));

const apiKey = String(config.fr24ApiKey || "").trim();
const authPrefix = String(config.fr24ApiAuthPrefix || "Bearer").trim();
const authHeader = String(config.fr24ApiAuthHeader || "Authorization").trim();
const acceptVersion = String(config.fr24ApiAcceptVersion || "v1").trim();

const headers = {
  Accept: "application/json",
  "Accept-Version": acceptVersion
};
if (apiKey) {
  const token = apiKey.toLowerCase().startsWith(`${authPrefix.toLowerCase()} `)
    ? apiKey
    : `${authPrefix} ${apiKey}`;
  headers[authHeader] = token;
}

console.log("URL:", url);
console.log("Headers:", JSON.stringify(headers, null, 2));
console.log("---");

const res = await fetch(url, { method: "GET", headers });
console.log("Status:", res.status, res.statusText);
console.log("Content-Type:", res.headers.get("content-type"));

const text = await res.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  console.log("Raw body (first 2000 chars):", text.slice(0, 2000));
  process.exit(1);
}

// Show top-level keys and types
console.log("\nTop-level keys:");
for (const [key, value] of Object.entries(payload)) {
  const type = Array.isArray(value) ? `array(${value.length})` : typeof value;
  console.log(`  ${key}: ${type}`);
}

// If there's a "data" key, check it
if (payload.data !== undefined) {
  if (Array.isArray(payload.data)) {
    console.log(`\npayload.data is array with ${payload.data.length} items`);
    if (payload.data.length > 0) {
      console.log("\nFirst item keys:");
      for (const [key, value] of Object.entries(payload.data[0])) {
        const type = Array.isArray(value) ? `array(${value.length})` : typeof value;
        console.log(`  ${key}: ${type}`);
      }
      console.log("\nFirst item (full):");
      console.log(JSON.stringify(payload.data[0], null, 2));
      if (payload.data.length > 1) {
        console.log("\nSecond item (full):");
        console.log(JSON.stringify(payload.data[1], null, 2));
      }
    }
  } else if (typeof payload.data === "object" && payload.data !== null) {
    console.log("\npayload.data is object with keys:");
    for (const [key, value] of Object.entries(payload.data)) {
      const type = Array.isArray(value) ? `array(${value.length})` : typeof value;
      console.log(`  ${key}: ${type}`);
    }
    // Check nested arrays
    for (const [key, value] of Object.entries(payload.data)) {
      if (Array.isArray(value) && value.length > 0) {
        console.log(`\npayload.data.${key} first item:`);
        console.log(JSON.stringify(value[0], null, 2));
        break;
      }
    }
  }
}

// Check for other common paths
for (const key of ["departures", "flights", "result", "items", "records", "rows"]) {
  if (payload[key] !== undefined) {
    const value = payload[key];
    const type = Array.isArray(value) ? `array(${value.length})` : typeof value;
    console.log(`\npayload.${key}: ${type}`);
    if (Array.isArray(value) && value.length > 0) {
      console.log(`First item of payload.${key}:`);
      console.log(JSON.stringify(value[0], null, 2));
    }
  }
}

// If top-level is array-like object or has numeric keys
const topKeys = Object.keys(payload);
if (topKeys.length > 0 && !isNaN(topKeys[0])) {
  console.log("\nPayload has numeric keys (array-like). First item:");
  console.log(JSON.stringify(payload[topKeys[0]], null, 2));
}

// Dump full payload if small
const fullJson = JSON.stringify(payload);
if (fullJson.length < 5000) {
  console.log("\nFull payload (small):");
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`\nPayload total size: ${fullJson.length} chars`);
}
