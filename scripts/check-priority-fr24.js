import dotenv from "dotenv";
import { searchOffers } from "../lib/duffel.js";
import { isOfferAllowed } from "../lib/filter.js";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const PRIORITY_DESTINATIONS = ["LHR", "MAN", "LIS", "DUB", "FCO", "MUC", "ZRH", "WAW", "PRG", "VNO", "BUD"];

// Extracted from the user's FR24 feed for Thursday, Mar 05 (DXB departures).
const FR24_ROWS = [
  { time: "11:20", flight: "VS401", to: "LHR", status: "Estimated" },
  { time: "12:10", flight: "EK31", to: "LHR", status: "Canceled" },
  { time: "13:10", flight: "BA108", to: "LHR", status: "Canceled" },
  { time: "14:30", flight: "EK3", to: "LHR", status: "Estimated" },
  { time: "14:30", flight: "EK19", to: "MAN", status: "Estimated" },
  { time: "14:30", flight: "EK193", to: "LIS", status: "Estimated" },
  { time: "14:35", flight: "EK163", to: "DUB", status: "Estimated" },
  { time: "14:50", flight: "EK23", to: "EDI", status: "Estimated" },
  { time: "15:05", flight: "EK95", to: "FCO", status: "Estimated" },
  { time: "15:35", flight: "FZ1839", to: "WAW", status: "Estimated" },
  { time: "15:50", flight: "EK51", to: "MUC", status: "Estimated" },
  { time: "15:55", flight: "EK85", to: "ZRH", status: "Estimated" },
  { time: "17:10", flight: "FZ1781", to: "PRG", status: "Estimated" },
  { time: "17:35", flight: "FZ1263", to: "VNO", status: "Estimated" },
  { time: "17:45", flight: "FZ1405", to: "BUD", status: "Estimated" },
  { time: "19:55", flight: "BA104", to: "LHR", status: "Canceled" }
];

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

function toNumber(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function summarizeOffer(offer) {
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};
  return {
    owner: offer?.owner?.name || offer?.owner?.iata_code || "Unknown",
    departAt: first?.departing_at || offer?.slices?.[0]?.departing_at || "",
    arriveAt: last?.arriving_at || "",
    totalAmount: offer?.total_amount || "",
    totalCurrency: offer?.total_currency || "",
    segments: segments.length
  };
}

function cheapestOffers(offers, limit = 3) {
  return offers
    .slice()
    .sort((a, b) => {
      const pa = Number.parseFloat(a.totalAmount || "9999999");
      const pb = Number.parseFloat(b.totalAmount || "9999999");
      return pa - pb;
    })
    .slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const departureDate = args.date || "2026-03-05";
  const origin = (args.origin || "DXB").toUpperCase();
  const adults = toNumber(args.adults, 1);
  const maxConnections = toNumber(args.maxConnections, 1);
  const cabinClass = args.cabinClass || process.env.DEFAULT_CABIN_CLASS || "economy";

  if (!process.env.DUFFEL_TOKEN) {
    throw new Error("Missing DUFFEL_TOKEN in .env");
  }

  const blocklistPath = path.resolve(process.cwd(), process.env.BLOCKLIST_FILE || "./config/blocked_middle_east.json");
  const blocklist = JSON.parse(fs.readFileSync(blocklistPath, "utf-8"));

  const config = {
    duffelToken: process.env.DUFFEL_TOKEN,
    duffelBaseUrl: process.env.DUFFEL_BASE_URL || "https://api.duffel.com",
    duffelVersion: process.env.DUFFEL_VERSION || "v2",
    duffelRateLimitPerMinute: Number.parseInt(process.env.DUFFEL_RATE_LIMIT_PER_MINUTE || "50", 10),
    duffelRateWindowMs: Number.parseInt(process.env.DUFFEL_RATE_WINDOW_MS || "60000", 10),
    blocklist
  };

  const filteredCandidates = FR24_ROWS.filter((row) => {
    const statusOk = row.status === "Scheduled" || row.status === "Estimated";
    const priorityOk = PRIORITY_DESTINATIONS.includes(row.to);
    return statusOk && priorityOk;
  });

  const uniqueDestinations = [...new Set(filteredCandidates.map((row) => row.to))];

  console.log(`FR24 candidates after status + non-ME priority filter: ${filteredCandidates.length} flights across ${uniqueDestinations.length} destinations`);
  console.log(filteredCandidates.map((x) => `${x.time} ${x.flight} -> ${x.to} (${x.status})`).join("\n"));

  const availability = [];
  const errors = [];

  for (const destination of uniqueDestinations) {
    try {
      const result = await searchOffers(config, {
        origin,
        destination,
        departureDate,
        adults,
        maxConnections,
        cabinClass
      });

      const raw = result.offers || [];
      const allowed = raw
        .filter((offer) => isOfferAllowed(offer, blocklist).allowed)
        .map(summarizeOffer)
        .filter((offer) => offer.owner !== "Duffel Airways");

      availability.push({
        destination,
        totalAllowed: allowed.length,
        top: cheapestOffers(allowed, 3)
      });
    } catch (err) {
      errors.push(`${origin}->${destination}: ${err.message}`);
    }
  }

  console.log("\nDuffel availability check results:");
  for (const item of availability) {
    console.log(`\n${origin}->${item.destination} | offers=${item.totalAllowed}`);
    if (item.top.length === 0) {
      console.log("  - no non-test offers found");
      continue;
    }
    for (const offer of item.top) {
      const price = offer.totalAmount ? `${offer.totalAmount} ${offer.totalCurrency}` : "N/A";
      console.log(`  - ${offer.owner} | dep ${offer.departAt} | ${price} | segments=${offer.segments}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const err of errors) {
      console.log(`  * ${err}`);
    }
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
