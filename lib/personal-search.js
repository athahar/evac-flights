import { searchOffersPersonal } from "./duffel.js";
import { searchStays } from "./duffel-stays.js";
import { resolveAirlineBooking } from "./airlineLinks.js";

// ── Booking link builders (reused from search-availability.js) ──────

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
  const d = date.replace(/-/g, "").slice(2);
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

// ── Offer mapping ───────────────────────────────────────────────────

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function getSegments(offer) {
  return (offer?.slices || []).flatMap((slice) => slice?.segments || []);
}

function computeLayoverMinutes(arriveIso, departIso) {
  if (!arriveIso || !departIso) return 0;
  const diff = new Date(departIso).getTime() - new Date(arriveIso).getTime();
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

function extractLayovers(segments) {
  if (segments.length <= 1) return [];
  return segments.slice(0, -1).map((seg, i) => {
    const connIata = upper(seg?.destination?.iata_code);
    const arriveAt = seg?.arriving_at;
    const nextDepartAt = segments[i + 1]?.departing_at;
    return {
      airport: connIata,
      city: connIata,
      durationMinutes: computeLayoverMinutes(arriveAt, nextDepartAt)
    };
  });
}

function computeTotalDurationMinutes(offer) {
  const slices = offer?.slices || [];
  let total = 0;
  for (const slice of slices) {
    const segments = slice?.segments || [];
    if (segments.length === 0) continue;
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (first?.departing_at && last?.arriving_at) {
      const diff = new Date(last.arriving_at).getTime() - new Date(first.departing_at).getTime();
      total += diff > 0 ? Math.round(diff / 60000) : 0;
    }
  }
  return total;
}

function mapOfferToResult(offer, origin, destination, departureDate) {
  const segments = getSegments(offer);
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};

  const marketingCode = upper(first?.marketing_carrier?.iata_code);
  const operatingCode = upper(first?.operating_carrier?.iata_code);
  const ownerCode = upper(offer?.owner?.iata_code);
  const carrierCode = marketingCode || operatingCode || ownerCode;
  const flightNumber = String(
    first?.marketing_carrier_flight_number ||
    first?.operating_carrier_flight_number ||
    ""
  ).trim();

  const booking = resolveAirlineBooking({
    airlineName: offer?.owner?.name || "",
    carrierCode,
    marketingCarrierCode: marketingCode,
    from: origin,
    to: destination,
    date: departureDate
  });

  const bookingLinks = buildBookingLinks({
    origin,
    destination,
    date: departureDate,
    carrierCode,
    airlineDirectUrl: booking.bookingUrl || ""
  });

  // Extract slice info for round-trips
  const slices = offer?.slices || [];
  const outboundSlice = slices[0];
  const returnSlice = slices.length > 1 ? slices[1] : null;

  const outboundSegments = outboundSlice?.segments || [];
  const outFirst = outboundSegments[0] || {};
  const outLast = outboundSegments[outboundSegments.length - 1] || {};

  let returnInfo = null;
  if (returnSlice) {
    const retSegments = returnSlice?.segments || [];
    const retFirst = retSegments[0] || {};
    const retLast = retSegments[retSegments.length - 1] || {};
    returnInfo = {
      departAt: retFirst?.departing_at || "",
      arriveAt: retLast?.arriving_at || "",
      origin: upper(retFirst?.origin?.iata_code),
      destination: upper(retLast?.destination?.iata_code),
      stops: Math.max(0, retSegments.length - 1),
      layovers: extractLayovers(retSegments)
    };
  }

  return {
    offerId: offer?.id || "",
    airline: offer?.owner?.name || "",
    carrierCode,
    flightNumber,
    origin: upper(outFirst?.origin?.iata_code) || origin,
    destination: upper(outLast?.destination?.iata_code) || destination,
    departAt: outFirst?.departing_at || "",
    arriveAt: outLast?.arriving_at || "",
    stops: Math.max(0, outboundSegments.length - 1),
    layovers: extractLayovers(outboundSegments),
    totalDurationMinutes: computeTotalDurationMinutes(offer),
    priceAmount: String(offer?.total_amount || ""),
    priceCurrency: String(offer?.total_currency || ""),
    cabinClass: offer?.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class || "",
    bookingUrl: booking.bookingUrl || "",
    bookingLinks,
    returnFlight: returnInfo,
    rawSliceCount: slices.length
  };
}

// ── Stay locations ──────────────────────────────────────────────────

const STAY_LOCATIONS = {
  maui: { name: "Maui", lat: 20.7984, lng: -156.3319 },
  kauai: { name: "Kauai", lat: 22.0964, lng: -159.5261 }
};

// ── Service factory ─────────────────────────────────────────────────

export function createPersonalSearchService({ config, supabase }) {

  async function saveSearch(searchType, queryJson, results, errors, durationMs) {
    try {
      const { error } = await supabase
        .from("personal_searches")
        .insert({
          search_type: searchType,
          query_json: queryJson,
          results_count: Array.isArray(results) ? results.length : 0,
          duration_ms: durationMs,
          results_json: results || [],
          errors_json: errors || []
        });
      if (error) console.error(`[personal] save failed: ${error.message}`);
    } catch (err) {
      console.error(`[personal] save failed: ${err.message}`);
    }
  }

  async function searchFlights(input) {
    const {
      origins, destinations,
      tripType = "one_way",
      departureDate, returnDate,
      adults = 1, children = 0,
      cabinClass = "economy"
    } = input;

    const startedAt = Date.now();
    const pairs = [];
    for (const orig of origins) {
      for (const dest of destinations) {
        if (orig === dest) continue;
        pairs.push({ origin: orig, destination: dest });
      }
    }

    console.log(`[personal] flight search: ${pairs.length} pairs, depart=${departureDate} return=${returnDate || "none"} adults=${adults} children=${children} cabin=${cabinClass}`);

    const results = await Promise.allSettled(
      pairs.map(async ({ origin, destination }) => {
        try {
          const { offers } = await searchOffersPersonal(config, {
            origin, destination,
            departureDate,
            returnDate: tripType === "round_trip" ? returnDate : undefined,
            adults, children, cabinClass
          });
          return offers.map((offer) => mapOfferToResult(offer, origin, destination, departureDate));
        } catch (err) {
          console.error(`[personal] ${origin}->${destination} failed: ${err.message}`);
          return { error: err.message, origin, destination };
        }
      })
    );

    const allOffers = [];
    const errors = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        const value = result.value;
        if (Array.isArray(value)) {
          allOffers.push(...value);
        } else if (value?.error) {
          errors.push(value);
        }
      } else {
        errors.push({ error: result.reason?.message || "unknown" });
      }
    }

    // Deduplicate by offerId
    const seen = new Set();
    const unique = [];
    for (const offer of allOffers) {
      if (offer.offerId && seen.has(offer.offerId)) continue;
      if (offer.offerId) seen.add(offer.offerId);
      unique.push(offer);
    }

    // Sort by price ascending
    unique.sort((a, b) => {
      const pa = Number.parseFloat(a.priceAmount) || Infinity;
      const pb = Number.parseFloat(b.priceAmount) || Infinity;
      return pa - pb;
    });

    const durationMs = Date.now() - startedAt;
    console.log(`[personal] flight search done: ${unique.length} offers, ${errors.length} errors, ${durationMs}ms`);

    await saveSearch("flights", input, unique, errors, durationMs);

    return { offers: unique, errors, durationMs, pairsSearched: pairs.length };
  }

  async function searchStaysForLocation(input) {
    const {
      location, checkInDate, checkOutDate,
      rooms = 1, adults = 2, children = 0
    } = input;

    const loc = STAY_LOCATIONS[location?.toLowerCase()];
    if (!loc) {
      throw new Error(`Unknown location: ${location}. Valid: ${Object.keys(STAY_LOCATIONS).join(", ")}`);
    }

    const startedAt = Date.now();
    console.log(`[personal] stays search: ${loc.name} checkin=${checkInDate} checkout=${checkOutDate} rooms=${rooms} adults=${adults} children=${children}`);

    const { results } = await searchStays(config, {
      latitude: loc.lat,
      longitude: loc.lng,
      checkInDate,
      checkOutDate,
      rooms,
      adults,
      children
    });

    const durationMs = Date.now() - startedAt;
    console.log(`[personal] stays search done: ${results.length} accommodations, ${durationMs}ms`);

    await saveSearch("stays", input, results, [], durationMs);

    return { results, durationMs, location: loc.name };
  }

  return { searchFlights, searchStaysForLocation };
}
