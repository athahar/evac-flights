import fs from "node:fs";
import crypto from "node:crypto";
import { isOfferAllowed } from "./filter.js";
import { parseFlightCode } from "./fr24.js";
import { resolveAirlineBooking } from "./airlineLinks.js";
import { searchOffers } from "./duffel.js";

const SEARCH_SOURCE_CACHE = "cache";
const SEARCH_SOURCE_LIVE = "live";

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

function mapOfferToSearchResult({ offer, origin, destinationIata, departureDate }) {
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

  return {
    offerId: offer?.id || "",
    airline: offer?.owner?.name || "",
    carrierCode,
    flightNumber,
    departAt: first?.departing_at || "",
    arriveAt: last?.arriving_at || "",
    stops: Math.max(0, segments.length - 1),
    priceAmount: String(offer?.total_amount || ""),
    priceCurrency: String(offer?.total_currency || ""),
    bookingUrl: booking.bookingUrl || "",
    websiteMode: booking.websiteMode || "dash"
  };
}

function sortAndTopOffers(offers, limit = 3) {
  return [...offers]
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

async function searchDestination({ config, origin, destinationIata, departureDate }) {
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
    departureDate
  }));
  return sortAndTopOffers(mapped, 3);
}

export function createSearchAvailabilityService({ config, storage, airportsByIata }) {
  const allowedOrigins = new Set((config.originAirports || []).map((value) => upper(value)));

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
        offersFound: cached.offersFound || 0,
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
    const destinationSearches = await Promise.all(
      split.checked.map(async (destinationIata) => {
        try {
          const offers = await searchDestination({ config, origin, destinationIata, departureDate });
          return { destinationIata, offers, error: "" };
        } catch (err) {
          return {
            destinationIata,
            offers: [],
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

      if (item.offers.length > 0) {
        results.push({
          destinationIata: item.destinationIata,
          destinationName: airportsByIata.get(item.destinationIata)?.name || item.destinationIata,
          offers: item.offers
        });
      }
    }

    const offersFound = results.reduce((sum, row) => sum + (Array.isArray(row.offers) ? row.offers.length : 0), 0);
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
      offersFound,
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
      offersFound,
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
  sortAndTopOffers,
  mapOfferToSearchResult
};
