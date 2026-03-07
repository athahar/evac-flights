import fs from "node:fs";
import crypto from "node:crypto";
import { isOfferAllowed } from "./filter.js";
import { parseFlightCode, loadFr24Data, filterFr24Rows } from "./fr24.js";
import { resolveAirlineBooking } from "./airlineLinks.js";
import { searchOffers } from "./duffel.js";

const SEARCH_SOURCE_CACHE = "cache";
const SEARCH_SOURCE_LIVE = "live";

// ── Booking link builders ──────────────────────────────────────────
// Ported from flightcheck.html (lines 670-801). Generates pre-filled
// deep links for Google Flights, Skyscanner, Kayak, and airline direct.

function pbVarint(val) {
  const b = [];
  do { b.push((val & 0x7f) | (val > 0x7f ? 0x80 : 0)); val >>>= 7; } while (val > 0);
  return b;
}

function pbTag(field, wire) { return pbVarint((field << 3) | wire); }

function pbStr(field, str) {
  const enc = new TextEncoder().encode(str);
  return [...pbTag(field, 2), ...pbVarint(enc.length), ...enc];
}

function pbMsg(field, data) {
  return [...pbTag(field, 2), ...pbVarint(data.length), ...data];
}

function pbInt(field, val) {
  return [...pbTag(field, 0), ...pbVarint(val)];
}

function buildGoogleFlightsUrl(origin, dest, date, carrierIata) {
  const orig = [...pbInt(1, 1), ...pbStr(2, origin)];
  const destNode = [...pbInt(1, 1), ...pbStr(2, dest)];
  const slice = [
    ...pbStr(2, date),
    ...(carrierIata ? pbStr(6, carrierIata) : []),
    ...pbMsg(13, orig),
    ...pbMsg(14, destNode)
  ];
  const root = pbMsg(3, slice);
  const b64 = Buffer.from(root)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `https://www.google.com/travel/flights/search?tfs=${b64}&hl=en`;
}

function buildSkyscannerUrl(origin, dest, date) {
  const d = date.replace(/-/g, "").slice(2); // YYYY-MM-DD → YYMMDD
  return `https://www.skyscanner.com/transport/flights/${origin.toLowerCase()}/${dest.toLowerCase()}/${d}/`;
}

function buildKayakUrl(origin, dest, date, carrierIata) {
  const filter = carrierIata ? `&fs=airlines=${carrierIata}` : "";
  return `https://www.kayak.com/flights/${origin}-${dest}/${date}?sort=bestflight_a${filter}`;
}

function buildBookingLinks({ origin, destination, date, carrierCode, airlineDirectUrl }) {
  return {
    google: buildGoogleFlightsUrl(origin, destination, date, carrierCode),
    skyscanner: buildSkyscannerUrl(origin, destination, date),
    kayak: buildKayakUrl(origin, destination, date, carrierCode),
    airline: airlineDirectUrl || ""
  };
}

// ── FR24 schedule merge helpers ────────────────────────────────────

async function loadFr24ScheduleForSearch(config, origin, date) {
  try {
    const fr24Loaded = await loadFr24Data(config, { allowedDates: [date] });
    const allRows = fr24Loaded.rows || [];
    const filtered = filterFr24Rows(allRows, {
      blockedAirports: config.blocklist?.airports || [],
      allowedStatuses: ["Scheduled", "Estimated"],
      allowedDates: [date]
    });
    const upperOrigin = upper(origin);
    return filtered.filter((row) => {
      const rowOrigin = upper(row.originAirport);
      return !rowOrigin || rowOrigin === upperOrigin;
    });
  } catch (err) {
    console.warn(`[search] FR24 schedule load failed: ${err.message}`);
    return [];
  }
}

function mapFr24RowToSearchResult({ row, origin, destinationIata, departureDate }) {
  const carrierCode = upper(row.carrierCode);
  const flightNumber = String(row.flightNumber || "").trim();

  const booking = resolveAirlineBooking({
    airlineName: row.airline || "",
    carrierCode,
    marketingCarrierCode: carrierCode,
    from: origin,
    to: destinationIata,
    date: departureDate
  });

  const bookingLinks = buildBookingLinks({
    origin,
    destination: destinationIata,
    date: departureDate,
    carrierCode,
    airlineDirectUrl: booking.bookingUrl || ""
  });

  return {
    offerId: "",
    airline: row.airline || "",
    carrierCode,
    flightNumber,
    departAt: row.departureLocalIso || "",
    arriveAt: "",
    stops: -1,
    layovers: [],
    priceAmount: "",
    priceCurrency: "",
    bookingUrl: booking.bookingUrl || "",
    websiteMode: booking.websiteMode || "dash",
    source: "fr24",
    fr24Verified: true,
    bookingLinks
  };
}

function matchFlightKey(carrierCode, flightNumber) {
  return `${upper(carrierCode)}${String(flightNumber || "").trim()}`;
}

function parseHourMinute(isoOrLocal) {
  if (!isoOrLocal) return null;
  const match = String(isoOrLocal).match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function mergeDuffelAndFr24Results(duffelResults, fr24Rows, origin, destinationIata, departureDate) {
  const matchedFr24Keys = new Set();

  // Pass 1: exact match by carrier + flight number
  for (const row of fr24Rows) {
    const key = matchFlightKey(row.carrierCode, row.flightNumber);
    if (!key) continue;
    for (const result of duffelResults) {
      const duffelKey = matchFlightKey(result.carrierCode, result.flightNumber);
      if (duffelKey === key) {
        result.source = "both";
        result.fr24Verified = true;
        matchedFr24Keys.add(key);
        break;
      }
    }
  }

  // Pass 2: fuzzy match by carrier + departure time ±30min
  for (const row of fr24Rows) {
    const key = matchFlightKey(row.carrierCode, row.flightNumber);
    if (matchedFr24Keys.has(key)) continue;

    const fr24Minutes = parseHourMinute(row.departureLocalIso);
    if (fr24Minutes === null) continue;

    for (const result of duffelResults) {
      if (result.fr24Verified) continue;
      if (upper(result.carrierCode) !== upper(row.carrierCode)) continue;

      const duffelMinutes = parseHourMinute(result.departAt);
      if (duffelMinutes === null) continue;
      if (Math.abs(duffelMinutes - fr24Minutes) <= 30) {
        result.source = "both";
        result.fr24Verified = true;
        matchedFr24Keys.add(key);
        break;
      }
    }
  }

  // FR24-only flights: unmatched rows
  const fr24Only = [];
  const seenFr24 = new Set();
  for (const row of fr24Rows) {
    const key = matchFlightKey(row.carrierCode, row.flightNumber);
    if (matchedFr24Keys.has(key) || seenFr24.has(key)) continue;
    seenFr24.add(key);
    fr24Only.push(mapFr24RowToSearchResult({ row, origin, destinationIata, departureDate }));
  }

  return { duffelResults, fr24OnlyResults: fr24Only };
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function getDateIsoInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getAllowedDateSet(timezone, maxDaysAhead) {
  const out = new Set();
  const base = new Date();
  for (let i = 0; i <= maxDaysAhead; i += 1) {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    out.add(getDateIsoInTimezone(d, timezone));
  }
  return out;
}

function normalizeDestinationsInput(destinations, maxDestinations) {
  const raw = Array.isArray(destinations) ? destinations : [];
  const normalized = raw
    .map((value) => upper(value))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const code of normalized) {
    if (seen.has(code)) continue;
    seen.add(code);
    unique.push(code);
  }

  if (unique.length === 0) return { ok: false, error: "destinations must include at least one IATA code" };
  if (unique.length > maxDestinations) {
    return { ok: false, error: `destinations supports up to ${maxDestinations} entries` };
  }
  return { ok: true, values: unique };
}

function normalizeAirportList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const byIata = new Map();

  for (const item of list) {
    const iata = upper(item?.iata);
    const name = String(item?.name || "").trim();
    const city = String(item?.city || "").trim();
    const country = upper(item?.country);
    if (!iata || !name) continue;
    const normalized = { iata, name, city, country };
    out.push(normalized);
    byIata.set(iata, normalized);
  }

  return { list: out, byIata };
}

export function loadSearchAirports(filePath) {
  const resolved = String(filePath || "").trim();
  if (!resolved) {
    throw new Error("search airports file path is empty");
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw);
  return normalizeAirportList(parsed);
}

function splitBlockedDestinations(destinations, airportsByIata, blocklist) {
  const blockedAirports = new Set((blocklist?.airports || []).map(upper));
  const blockedCountries = new Set((blocklist?.countries || []).map(upper));

  const checked = [];
  const blocked = [];

  for (const code of destinations) {
    const airport = airportsByIata.get(code);
    if (!airport) continue;

    if (blockedAirports.has(code)) {
      blocked.push(code);
      continue;
    }

    if (airport.country && blockedCountries.has(airport.country)) {
      blocked.push(code);
      continue;
    }

    checked.push(code);
  }

  return { checked, blocked };
}

function buildQuerySignature({ origin, departureDate, destinationsChecked }) {
  const sorted = [...destinationsChecked].sort();
  const base = `${origin}|${departureDate}|${sorted.join(",")}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

function parsePriceValue(value) {
  const num = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(num)) return Number.POSITIVE_INFINITY;
  return num;
}

function getSegments(offer) {
  return (offer?.slices || []).flatMap((slice) => slice?.segments || []);
}

function computeLayoverMinutes(arriveIso, departIso) {
  if (!arriveIso || !departIso) return 0;
  const diff = new Date(departIso).getTime() - new Date(arriveIso).getTime();
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

function extractLayovers(segments, airportsByIata) {
  if (segments.length <= 1) return [];
  return segments.slice(0, -1).map((seg, i) => {
    const connIata = upper(seg?.destination?.iata_code);
    const airport = airportsByIata?.get(connIata);
    const arriveAt = seg?.arriving_at;
    const nextDepartAt = segments[i + 1]?.departing_at;
    return {
      airport: connIata,
      city: airport?.city || connIata,
      durationMinutes: computeLayoverMinutes(arriveAt, nextDepartAt)
    };
  });
}

function mapOfferToSearchResult({ offer, origin, destinationIata, departureDate, airportsByIata }) {
  const segments = getSegments(offer);
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};

  const marketingCode = upper(first?.marketing_carrier?.iata_code);
  const operatingCode = upper(first?.operating_carrier?.iata_code);
  const ownerCode = upper(offer?.owner?.iata_code);
  const preferredCarrier = marketingCode || operatingCode || ownerCode;
  const preferredNumber = String(
    first?.marketing_carrier_flight_number ||
    first?.operating_carrier_flight_number ||
    first?.flight_number ||
    ""
  ).trim();
  const parsedFlight = parseFlightCode(`${preferredCarrier}${preferredNumber}`.trim());
  const carrierCode = parsedFlight.carrierCode || preferredCarrier || "";
  const flightNumber = parsedFlight.flightNumber || preferredNumber || "";

  const booking = resolveAirlineBooking({
    airlineName: offer?.owner?.name || "",
    carrierCode,
    marketingCarrierCode: marketingCode,
    from: origin,
    to: destinationIata,
    date: departureDate
  });

  const bookingLinks = buildBookingLinks({
    origin,
    destination: destinationIata,
    date: departureDate,
    carrierCode,
    airlineDirectUrl: booking.bookingUrl || ""
  });

  return {
    offerId: offer?.id || "",
    airline: offer?.owner?.name || "",
    carrierCode,
    flightNumber,
    departAt: first?.departing_at || "",
    arriveAt: last?.arriving_at || "",
    stops: Math.max(0, segments.length - 1),
    layovers: extractLayovers(segments, airportsByIata),
    priceAmount: String(offer?.total_amount || ""),
    priceCurrency: String(offer?.total_currency || ""),
    bookingUrl: booking.bookingUrl || "",
    websiteMode: booking.websiteMode || "dash",
    source: "duffel",
    fr24Verified: false,
    bookingLinks
  };
}

function dedupeByAirline(offers) {
  const byAirline = new Map();
  for (const offer of offers) {
    const key = upper(offer.airline) || offer.offerId || "unknown";
    const existing = byAirline.get(key);
    if (!existing || parsePriceValue(offer.priceAmount) < parsePriceValue(existing.priceAmount)) {
      byAirline.set(key, offer);
    }
  }
  return [...byAirline.values()];
}

function sortAndTopOffers(offers, limit = 6) {
  const unique = dedupeByAirline(offers);
  return unique
    .sort((a, b) => {
      const priceDelta = parsePriceValue(a.priceAmount) - parsePriceValue(b.priceAmount);
      if (priceDelta !== 0) return priceDelta;
      const departDelta = String(a.departAt || "").localeCompare(String(b.departAt || ""));
      if (departDelta !== 0) return departDelta;
      return String(a.offerId || "").localeCompare(String(b.offerId || ""));
    })
    .slice(0, limit);
}

export class SearchAvailabilityError extends Error {
  constructor(message, status = 400, retryAfterSeconds = 0) {
    super(message);
    this.name = "SearchAvailabilityError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function searchDestination({ config, origin, destinationIata, departureDate, airportsByIata, fr24Rows }) {
  const result = await searchOffers(config, {
    origin,
    destination: destinationIata,
    departureDate,
    adults: config.paxAdults,
    maxConnections: config.maxConnections,
    cabinClass: config.defaultCabinClass
  });

  const allAllowed = (result.offers || [])
    .filter((offer) => isOfferAllowed(offer, config.blocklist).allowed)
    .filter((offer) => !config.dashboardExcludeTestAirline || (offer?.owner?.name || "") !== "Duffel Airways");

  const mapped = allAllowed.map((offer) => mapOfferToSearchResult({
    offer,
    origin,
    destinationIata,
    departureDate,
    airportsByIata
  }));
  const topDuffel = sortAndTopOffers(mapped, 6);

  // Merge with FR24 schedule data (if available)
  const destFr24Rows = (fr24Rows || []).filter(
    (row) => upper(row.destinationIata) === upper(destinationIata)
  );

  if (destFr24Rows.length === 0) {
    return topDuffel;
  }

  const { duffelResults, fr24OnlyResults } = mergeDuffelAndFr24Results(
    topDuffel, destFr24Rows, origin, destinationIata, departureDate
  );

  // Sort FR24-only by departure time
  const fr24Sorted = fr24OnlyResults.sort((a, b) =>
    String(a.departAt || "").localeCompare(String(b.departAt || ""))
  );

  // Duffel results first (by price), then FR24-only (by time), cap at 10
  return [...duffelResults, ...fr24Sorted].slice(0, 10);
}

export function createSearchAvailabilityService({ config, storage, airportsByIata }) {
  const allowedOrigins = new Set((config.searchAllowedOrigins || config.originAirports || []).map((value) => upper(value)));

  async function searchAvailability(input, options = {}) {
    if (!config.searchEnabled) {
      throw new SearchAvailabilityError("Search is disabled", 400);
    }

    const origin = upper(input?.origin);
    if (!origin || !allowedOrigins.has(origin)) {
      throw new SearchAvailabilityError(`origin must be one of: ${Array.from(allowedOrigins).join(", ")}`, 400);
    }

    const departureDate = String(input?.departureDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
      throw new SearchAvailabilityError("departureDate must be in YYYY-MM-DD format", 400);
    }

    const allowedDates = getAllowedDateSet(config.dashboardTimezone, config.searchDateRangeDays);
    if (!allowedDates.has(departureDate)) {
      throw new SearchAvailabilityError(
        `departureDate must be between Dubai today and +${config.searchDateRangeDays} days`,
        400
      );
    }

    const normalizedDestinations = normalizeDestinationsInput(input?.destinations, config.searchMaxDestinations);
    if (!normalizedDestinations.ok) {
      throw new SearchAvailabilityError(normalizedDestinations.error, 400);
    }

    const unknownDestinations = normalizedDestinations.values.filter((iata) => !airportsByIata.has(iata));
    if (unknownDestinations.length > 0) {
      throw new SearchAvailabilityError(`unknown or unsupported destinations: ${unknownDestinations.join(", ")}`, 400);
    }

    const split = splitBlockedDestinations(normalizedDestinations.values, airportsByIata, config.blocklist);
    const querySignature = buildQuerySignature({
      origin,
      departureDate,
      destinationsChecked: split.checked
    });

    const cached = await storage.getRecentSearchBySignature(querySignature, config.searchCacheTtlSeconds);
    if (cached) {
      return {
        ok: true,
        source: SEARCH_SOURCE_CACHE,
        searchId: cached.id,
        origin,
        departureDate,
        destinationsRequested: normalizedDestinations.values,
        destinationsChecked: split.checked,
        destinationsBlocked: split.blocked,
        pairsChecked: cached.pairsChecked || 0,
        flightsFound: cached.offersFound || cached.flightsFound || 0,
        durationMs: cached.durationMs || 0,
        results: Array.isArray(cached.results) ? cached.results : [],
        errors: Array.isArray(cached.errors) ? cached.errors : []
      };
    }

    if (split.checked.length > 0 && typeof options.beforeLiveCall === "function") {
      await options.beforeLiveCall({
        origin,
        departureDate,
        destinationsChecked: split.checked,
        querySignature
      });
    }

    const startedAt = Date.now();

    // Pre-load FR24 schedule data once for all destinations
    const fr24Rows = await loadFr24ScheduleForSearch(config, origin, departureDate);

    const destinationSearches = await Promise.all(
      split.checked.map(async (destinationIata) => {
        try {
          const flights = await searchDestination({ config, origin, destinationIata, departureDate, airportsByIata, fr24Rows });
          return { destinationIata, flights, error: "" };
        } catch (err) {
          return {
            destinationIata,
            flights: [],
            error: String(err?.message || "search failed")
          };
        }
      })
    );

    const results = [];
    const errors = [];
    for (const item of destinationSearches) {
      if (item.error) {
        errors.push({
          destinationIata: item.destinationIata,
          destinationName: airportsByIata.get(item.destinationIata)?.name || item.destinationIata,
          error: item.error
        });
      }

      if (item.flights.length > 0) {
        results.push({
          destinationIata: item.destinationIata,
          destinationName: airportsByIata.get(item.destinationIata)?.name || item.destinationIata,
          flights: item.flights
        });
      }
    }

    const flightsFound = results.reduce((sum, row) => sum + (Array.isArray(row.flights) ? row.flights.length : 0), 0);
    const durationMs = Date.now() - startedAt;
    const createdAt = new Date().toISOString();

    const searchId = await storage.saveSearchQuery({
      createdAt,
      querySignature,
      origin,
      departureDate,
      destinations: normalizedDestinations.values,
      destinationsBlocked: split.blocked,
      source: SEARCH_SOURCE_LIVE,
      pairsChecked: split.checked.length,
      offersFound: flightsFound,
      flightsFound,
      durationMs,
      errors,
      results
    });

    return {
      ok: true,
      source: SEARCH_SOURCE_LIVE,
      searchId,
      origin,
      departureDate,
      destinationsRequested: normalizedDestinations.values,
      destinationsChecked: split.checked,
      destinationsBlocked: split.blocked,
      pairsChecked: split.checked.length,
      flightsFound,
      durationMs,
      results,
      errors
    };
  }

  return {
    searchAvailability
  };
}

export const __testables = {
  getDateIsoInTimezone,
  getAllowedDateSet,
  normalizeDestinationsInput,
  splitBlockedDestinations,
  buildQuerySignature,
  dedupeByAirline,
  sortAndTopOffers,
  mapOfferToSearchResult,
  computeLayoverMinutes,
  extractLayovers
};
