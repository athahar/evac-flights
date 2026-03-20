#!/usr/bin/env node

/**
 * Scrape FR24 departures via their internal schedule API.
 *
 * Usage:
 *   node scripts/scrape-fr24-departures.js DXB
 *   node scripts/scrape-fr24-departures.js DXB MCT SFO
 *   node scripts/scrape-fr24-departures.js DXB --out data/input
 *   node scripts/scrape-fr24-departures.js DXB --json
 *
 * --json emits app-ready normalized rows (same shape as loadFr24Data output).
 * Default (no --json) emits text in parseFr24File() format for backward compat.
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeScrapeApiFlight } from "../lib/fr24.js";

const FR24_SCHEDULE_URL =
  "https://api.flightradar24.com/common/v1/airport.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Fetch helpers ────────────────────────────────────────────────────

async function fetchPage(airportCode, page, timestamp) {
  const params = new URLSearchParams({
    code: airportCode.toLowerCase(),
    "plugin[]": "schedule",
    "plugin-setting[schedule][mode]": "departures",
    "plugin-setting[schedule][timestamp]": String(timestamp),
    page: String(page),
    limit: "100",
    token: "",
  });

  const res = await fetch(`${FR24_SCHEDULE_URL}?${params}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function fetchAllDepartures(airportCode) {
  const timestamp = Math.floor(Date.now() / 1000);
  const allFlights = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await fetchPage(airportCode, page, timestamp);
    const schedule =
      data?.result?.response?.airport?.pluginData?.schedule?.departures;

    if (!schedule) {
      console.error(
        `[fr24-scrape] No schedule data for ${airportCode} page ${page}`
      );
      break;
    }

    const flights = schedule.data || [];
    const pageInfo = schedule.page || {};
    totalPages = pageInfo.total || 1;

    allFlights.push(...flights);
    console.error(
      `[fr24-scrape] ${airportCode} page ${page}/${totalPages}: ${flights.length} flights`
    );

    page += 1;
    if (page <= totalPages) {
      await sleep(500);
    }
  }

  console.error(
    `[fr24-scrape] ${airportCode} total: ${allFlights.length} flights`
  );
  return allFlights;
}

// ── Text output (backward compat for parseFr24File) ──────────────────

function formatTime12(unixSec, timezone) {
  const date = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value || "12";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  const dayPeriod =
    parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() || "AM";
  return `${hour}:${minute} ${dayPeriod}`;
}

function formatDateHeader(unixSec, timezone) {
  const date = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "2-digit",
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${weekday}, ${month} ${day}`;
}

function formatStatusText(flight) {
  const generic = flight?.status?.generic;
  if (!generic) return "Scheduled";

  const statusText = generic?.status?.text || "scheduled";
  const eventTimeUtc = generic?.eventTime?.utc;
  const originTz = flight?.airport?.origin?.timezone?.name || "UTC";

  if (statusText === "canceled") return "Canceled";
  if (statusText === "estimated" || statusText === "delayed") {
    if (eventTimeUtc) {
      return `Estimated dep. ${formatTime12(eventTimeUtc, originTz)}`;
    }
    return "Estimated";
  }
  if (statusText === "departed" || statusText === "en-route") {
    if (eventTimeUtc) {
      return `Departed ${formatTime12(eventTimeUtc, originTz)}`;
    }
    return "Departed";
  }
  if (statusText === "landed") return "Landed";
  if (statusText === "diverted") return "Diverted";
  return "Scheduled";
}

function flightsToFr24Text(flights, airportCode) {
  const lines = [];
  let currentDateKey = "";

  const sorted = [...flights].sort((a, b) => {
    const aTime = a?.flight?.time?.scheduled?.departure || 0;
    const bTime = b?.flight?.time?.scheduled?.departure || 0;
    return aTime - bTime;
  });

  for (const item of sorted) {
    const f = item.flight;
    if (!f) continue;

    const schedDep = f?.time?.scheduled?.departure;
    if (!schedDep) continue;

    const originTz = f?.airport?.origin?.timezone?.name || "UTC";
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: originTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(schedDep * 1000));

    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      lines.push(formatDateHeader(schedDep, originTz));
    }

    const timeStr = formatTime12(schedDep, originTz);
    const flightNum = f?.identification?.number?.default || "-";
    const destCity = f?.airport?.destination?.position?.region?.city || "-";
    const destIata = f?.airport?.destination?.code?.iata || "-";
    const airlineName = f?.airline?.name || "-";
    const modelCode = f?.aircraft?.model?.code || "-";
    const registration = f?.aircraft?.registration || "";
    const status = formatStatusText(f);
    const aircraftField = registration ? `${modelCode} (${registration})` : modelCode;

    lines.push(`${timeStr}\t${flightNum}\t`);
    lines.push(`${destCity} (${destIata})`);
    lines.push(`${airlineName}\t${aircraftField}\t`);
    lines.push(status);
  }

  return lines.join("\n") + "\n";
}

// ── JSON output (app-ready, uses shared normalizer) ──────────────────

function flightsToJson(flights, airportCode) {
  const scrapedAt = new Date().toISOString();
  const rows = flights
    .map((item) => normalizeScrapeApiFlight(item, airportCode))
    .filter(Boolean);

  // Detect timezone from first row (API provides it)
  const timezone = rows[0]?.timezone || "UTC";

  return {
    source: "fr24-scrape",
    scrapedAt,
    airport: airportCode.toUpperCase(),
    timezone,
    totalFlights: rows.length,
    flights: rows,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const airports = [];
let outDir = null;
let jsonMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outDir = args[++i];
  } else if (args[i] === "--json") {
    jsonMode = true;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`Usage: node scripts/scrape-fr24-departures.js <AIRPORT...> [--out DIR] [--json]

Examples:
  node scripts/scrape-fr24-departures.js DXB
  node scripts/scrape-fr24-departures.js DXB MCT SFO --out data/input
  node scripts/scrape-fr24-departures.js DXB --json`);
    process.exit(0);
  } else {
    airports.push(args[i].toUpperCase());
  }
}

if (airports.length === 0) {
  console.error("Usage: node scripts/scrape-fr24-departures.js <AIRPORT...> [--out DIR] [--json]");
  process.exit(1);
}

const now = new Date();
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

for (const airport of airports) {
  try {
    const flights = await fetchAllDepartures(airport);

    if (jsonMode) {
      const envelope = flightsToJson(flights, airport);
      if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, `fr24-${dateStamp}-${airport.toLowerCase()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2));
        console.error(`[fr24-scrape] wrote ${filePath} (${envelope.totalFlights} flights)`);
      } else {
        console.log(JSON.stringify(envelope, null, 2));
      }
    } else {
      const text = flightsToFr24Text(flights, airport);
      if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, `fr24-${dateStamp}-${airport.toLowerCase()}`);
        fs.writeFileSync(filePath, text);
        console.error(`[fr24-scrape] wrote ${filePath} (${flights.length} flights)`);
      } else {
        console.log(text);
      }
    }
  } catch (err) {
    console.error(`[fr24-scrape] ERROR ${airport}: ${err.message}`);
    process.exit(1);
  }
}
