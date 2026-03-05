import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { searchOffers } from "../lib/duffel.js";
import { getRouteEndpoints, isOfferAllowed } from "../lib/filter.js";

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

function readDestinations(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizeOffer(offer, date) {
  const endpoints = getRouteEndpoints(offer);
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  const firstSegment = segments[0] || null;
  const lastSegment = segments[segments.length - 1] || null;

  return {
    date,
    ownerCode: offer?.owner?.iata_code || "",
    ownerName: offer?.owner?.name || "",
    origin: endpoints.origin || firstSegment?.origin?.iata_code || "",
    destination: endpoints.destination || lastSegment?.destination?.iata_code || "",
    departAt: firstSegment?.departing_at || offer?.slices?.[0]?.departing_at || "",
    arriveAt: lastSegment?.arriving_at || "",
    totalAmount: offer?.total_amount || "",
    totalCurrency: offer?.total_currency || "",
    segmentCount: segments.length
  };
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function printReport(rows) {
  if (rows.length === 0) {
    console.log("No matching offers found for the selected dates.");
    return;
  }

  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }

  for (const [date, offers] of byDate) {
    console.log(`\n=== ${date} | ${offers.length} unique offer(s) ===`);
    const sorted = offers
      .slice()
      .sort((a, b) => {
        const pa = Number.parseFloat(a.totalAmount || "999999");
        const pb = Number.parseFloat(b.totalAmount || "999999");
        return pa - pb;
      })
      .slice(0, 100);

    for (const offer of sorted) {
      const airline = offer.ownerName || offer.ownerCode || "Unknown";
      const depart = offer.departAt || "unknown_depart";
      const price = offer.totalAmount ? `${offer.totalAmount} ${offer.totalCurrency}` : "N/A";
      const route = `${offer.origin}->${offer.destination}`;
      console.log(`- ${airline} | ${route} | ${depart} | ${price} | segments=${offer.segmentCount}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dates = (args.dates || "2026-03-05,2026-03-06,2026-03-07")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const origins = (args.origins || process.env.ORIGIN_AIRPORTS || "DXB")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

  const destinationsFile = path.resolve(process.cwd(), process.env.DESTINATIONS_FILE || "./config/destinations.txt");
  const destinations = readDestinations(destinationsFile);

  const concurrency = Number.parseInt(args.concurrency || "4", 10);
  const maxConnections = Number.parseInt(args.maxConnections || process.env.MAX_CONNECTIONS || "1", 10);
  const adults = Number.parseInt(args.adults || process.env.PAX_ADULTS || "1", 10);
  const cabinClass = args.cabinClass || process.env.DEFAULT_CABIN_CLASS || "economy";

  if (!process.env.DUFFEL_TOKEN) {
    throw new Error("Missing DUFFEL_TOKEN in environment");
  }

  const config = {
    duffelToken: process.env.DUFFEL_TOKEN,
    duffelBaseUrl: process.env.DUFFEL_BASE_URL || "https://api.duffel.com",
    duffelVersion: process.env.DUFFEL_VERSION || "v2",
    duffelRateLimitPerMinute: Number.parseInt(process.env.DUFFEL_RATE_LIMIT_PER_MINUTE || "50", 10),
    duffelRateWindowMs: Number.parseInt(process.env.DUFFEL_RATE_WINDOW_MS || "60000", 10),
    blocklist: JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), process.env.BLOCKLIST_FILE || "./config/blocked_middle_east.json"),
        "utf-8"
      )
    )
  };

  const jobs = [];
  for (const date of dates) {
    for (const origin of origins) {
      for (const destination of destinations) {
        if (origin !== destination) {
          jobs.push({ date, origin, destination });
        }
      }
    }
  }

  const matches = [];
  const errors = [];

  console.log(`Scanning ${jobs.length} origin/destination/date combinations...`);

  await runPool(jobs, concurrency, async (job) => {
    try {
      const result = await searchOffers(config, {
        origin: job.origin,
        destination: job.destination,
        departureDate: job.date,
        adults,
        maxConnections,
        cabinClass
      });

      for (const offer of result.offers || []) {
        const decision = isOfferAllowed(offer, config.blocklist);
        if (!decision.allowed) continue;
        matches.push(normalizeOffer(offer, job.date));
      }
    } catch (err) {
      errors.push(`${job.date} ${job.origin}->${job.destination}: ${err.message}`);
    }
  });

  const unique = uniqueBy(
    matches,
    (x) => [x.date, x.ownerCode, x.origin, x.destination, x.departAt, x.totalAmount, x.totalCurrency].join("|")
  );

  console.log(`Found ${unique.length} unique matching offers.`);
  if (errors.length > 0) {
    console.log(`Encountered ${errors.length} search errors (showing up to 20):`);
    for (const err of errors.slice(0, 20)) {
      console.log(`  * ${err}`);
    }
  }

  printReport(unique);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
