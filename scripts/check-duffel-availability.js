import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { searchOffers } from "../lib/duffel.js";
import { isOfferAllowed } from "../lib/filter.js";

dotenv.config();

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
  const lines = raw ? raw.split(/\r?\n/) : [];
  if (lines.length === 0) return { headers: [], rows: [] };

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

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeOffer(offer) {
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};

  return {
    owner: offer?.owner?.name || offer?.owner?.iata_code || "Unknown",
    ownerCode: offer?.owner?.iata_code || "",
    departAt: first?.departing_at || offer?.slices?.[0]?.departing_at || "",
    arriveAt: last?.arriving_at || "",
    totalAmount: offer?.total_amount || "",
    totalCurrency: offer?.total_currency || "",
    segments: segments.length
  };
}

function cheapest(items, limit = 3) {
  return items
    .slice()
    .sort((a, b) => {
      const pa = Number.parseFloat(a.totalAmount || "9999999");
      const pb = Number.parseFloat(b.totalAmount || "9999999");
      return pa - pb;
    })
    .slice(0, limit);
}

function dedupeOffers(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = [
      item.owner,
      item.departAt,
      item.arriveAt,
      item.totalAmount,
      item.totalCurrency,
      item.segments
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const inputFile = path.resolve(cwd, args.input || "./data/output/fr24-march-05.no-me.priority.tsv");
  const outputFile = path.resolve(cwd, args.output || "./data/output/fr24-march-05.no-me.priority.duffel-availability.tsv");
  const origin = (args.origin || process.env.ORIGIN_AIRPORTS || "DXB").split(",")[0].trim().toUpperCase();
  const departureDate = args.date || "2026-03-05";
  const adults = toInt(args.adults || process.env.PAX_ADULTS || 1, 1);
  const maxConnections = toInt(args.maxConnections || process.env.MAX_CONNECTIONS || 1, 1);
  const cabinClass = args.cabinClass || process.env.DEFAULT_CABIN_CLASS || "economy";
  const includeTestAirline = String(args.includeTestAirline || "false").toLowerCase() === "true";
  const delayMs = toInt(args.delayMs || 1200, 1200);
  const retryAttempts = toInt(args.retryAttempts || 4, 4);
  const backoffMs = toInt(args.backoffMs || 1500, 1500);
  const rpm = toInt(args.rpm || process.env.DUFFEL_RATE_LIMIT_PER_MINUTE || 50, 50);

  if (!process.env.DUFFEL_TOKEN) {
    throw new Error("Missing DUFFEL_TOKEN in .env");
  }

  const { rows } = parseTsv(inputFile);
  if (rows.length === 0) {
    throw new Error(`No rows found in input file: ${inputFile}`);
  }

  const blocklist = JSON.parse(
    fs.readFileSync(path.resolve(cwd, process.env.BLOCKLIST_FILE || "./config/blocked_middle_east.json"), "utf-8")
  );

  const destinations = [...new Set(rows.map((r) => String(r.destination_iata || "").toUpperCase()).filter(Boolean))];

  const config = {
    duffelToken: process.env.DUFFEL_TOKEN,
    duffelBaseUrl: process.env.DUFFEL_BASE_URL || "https://api.duffel.com",
    duffelVersion: process.env.DUFFEL_VERSION || "v2",
    duffelLogs: String(process.env.DUFFEL_LOGS || "true").toLowerCase() === "true",
    duffelLogPayloads: String(process.env.DUFFEL_LOG_PAYLOADS || "false").toLowerCase() === "true",
    duffelMaxAttempts: retryAttempts,
    duffelBackoffMs: backoffMs,
    duffelRateLimitPerMinute: rpm,
    duffelRateWindowMs: 60_000
  };

  const resultRows = [];
  const summary = [];
  const errors = [];

  for (const destination of destinations) {
    try {
      const search = await searchOffers(config, {
        origin,
        destination,
        departureDate,
        adults,
        maxConnections,
        cabinClass
      });

      const allowed = (search.offers || [])
        .filter((offer) => isOfferAllowed(offer, blocklist).allowed)
        .map(normalizeOffer)
        .filter((offer) => includeTestAirline || offer.owner !== "Duffel Airways");

      const top = cheapest(dedupeOffers(allowed), 3);

      summary.push({ destination, total: allowed.length, top });

      for (const item of top) {
        const price = item.totalAmount ? `${item.totalAmount} ${item.totalCurrency}` : "N/A";
        console.log(
          `MATCH ${origin}->${destination} | ${item.owner} | dep ${item.departAt || "unknown"} | ${price} | segments=${item.segments}`
        );
      }

      for (const item of top) {
        resultRows.push({
          destination_iata: destination,
          owner: item.owner,
          owner_code: item.ownerCode,
          depart_at: item.departAt,
          arrive_at: item.arriveAt,
          total_amount: item.totalAmount,
          total_currency: item.totalCurrency,
          segments: String(item.segments)
        });
      }

      if (top.length === 0) {
        console.log(`NO_MATCH ${origin}->${destination}`);
      }
    } catch (err) {
      errors.push(`${origin}->${destination}: ${err.message}`);
      summary.push({ destination, total: 0, top: [] });
      console.log(`ERROR ${origin}->${destination} | ${err.message}`);
    }

    if (delayMs > 0) {
      // Gentle pacing between destinations to reduce API rate-limit spikes.
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }

  const headers = [
    "destination_iata",
    "owner",
    "owner_code",
    "depart_at",
    "arrive_at",
    "total_amount",
    "total_currency",
    "segments"
  ];

  const lines = [
    headers.join("\t"),
    ...resultRows.map((row) => headers.map((h) => row[h] || "").join("\t"))
  ];
  fs.writeFileSync(outputFile, `${lines.join("\n")}\n`, "utf-8");

  console.log(`Checked destinations: ${destinations.length}`);
  console.log(`Origin: ${origin} | Date: ${departureDate}`);
  console.log("Availability by destination:");
  for (const row of summary.sort((a, b) => a.destination.localeCompare(b.destination))) {
    console.log(`  ${row.destination}: ${row.total} offer(s)`);
  }
  console.log(`Output file: ${outputFile}`);

  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    for (const err of errors) {
      console.log(`  * ${err}`);
    }
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
